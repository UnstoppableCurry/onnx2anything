#include <MNN/Interpreter.hpp>
#include <MNN/Tensor.hpp>

#include <cstdlib>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

#include "tensor_dump.hpp"

namespace {

std::vector<int> to_mnn_shape(const std::vector<int64_t>& shape) {
  std::vector<int> result;
  result.reserve(shape.size());
  for (const auto dim : shape) {
    result.push_back(static_cast<int>(dim));
  }
  return result;
}

onnx2anything::TensorDump to_tensor_dump(const MNN::Tensor* tensor) {
  if (tensor == nullptr) {
    throw std::runtime_error("Encountered null MNN tensor");
  }

  const auto type = tensor->getType();
  if (type.code != halide_type_float || type.bytes() != 4) {
    throw std::runtime_error("MNN runner currently supports float32 tensors only");
  }

  auto host_tensor = std::unique_ptr<MNN::Tensor>(
      MNN::Tensor::createHostTensorFromDevice(tensor, false));
  if (!tensor->copyToHostTensor(host_tensor.get())) {
    throw std::runtime_error("Failed to copy MNN output tensor to host");
  }

  onnx2anything::TensorDump dump;
  const auto shape = host_tensor->shape();
  dump.shape.assign(shape.begin(), shape.end());
  dump.data.assign(host_tensor->host<float>(),
                   host_tensor->host<float>() + host_tensor->elementSize());
  return dump;
}

}  // namespace

int main(int argc, char** argv) {
  if (argc != 4) {
    std::cerr << "Usage: mnn_infer <modelPath> <inputDumpPath> <outputDumpPath>\n";
    return 1;
  }

  try {
    const std::string model_path = argv[1];
    const std::string input_dump_path = argv[2];
    const std::string output_dump_path = argv[3];

    const auto inputs = onnx2anything::read_tensor_dump(input_dump_path);
    if (inputs.size() != 1) {
      throw std::runtime_error("MNN runner currently supports exactly one input tensor");
    }

    std::unique_ptr<MNN::Interpreter> interpreter(MNN::Interpreter::createFromFile(model_path.c_str()));
    if (!interpreter) {
      throw std::runtime_error("Failed to load MNN model: " + model_path);
    }

    MNN::ScheduleConfig schedule_config;
    schedule_config.type = MNN_FORWARD_CPU;
    schedule_config.numThread = 1;
    auto* session = interpreter->createSession(schedule_config);
    if (session == nullptr) {
      throw std::runtime_error("Failed to create MNN session");
    }

    auto* input_tensor = interpreter->getSessionInput(session, nullptr);
    if (input_tensor == nullptr) {
      throw std::runtime_error("Failed to resolve MNN input tensor");
    }

    const auto input_shape = to_mnn_shape(inputs[0].shape);
    interpreter->resizeTensor(input_tensor, input_shape);
    interpreter->resizeSession(session);
    input_tensor = interpreter->getSessionInput(session, nullptr);

    const auto input_type = input_tensor->getType();
    if (input_type.code != halide_type_float || input_type.bytes() != 4) {
      throw std::runtime_error("MNN input tensor is not float32");
    }

    MNN::Tensor host_input(input_tensor, input_tensor->getDimensionType());
    if (static_cast<std::size_t>(host_input.elementSize()) != inputs[0].data.size()) {
      throw std::runtime_error("MNN input tensor size does not match prepared input");
    }

    auto* host_ptr = host_input.host<float>();
    std::copy(inputs[0].data.begin(), inputs[0].data.end(), host_ptr);
    if (!input_tensor->copyFromHostTensor(&host_input)) {
      throw std::runtime_error("Failed to copy host input into MNN tensor");
    }

    interpreter->runSession(session);

    std::vector<onnx2anything::TensorDump> outputs;
    const auto& output_map = interpreter->getSessionOutputAll(session);
    if (!output_map.empty()) {
      outputs.reserve(output_map.size());
      for (const auto& item : output_map) {
        outputs.push_back(to_tensor_dump(item.second));
      }
    } else {
      outputs.push_back(to_tensor_dump(interpreter->getSessionOutput(session, nullptr)));
    }

    onnx2anything::write_tensor_dump(output_dump_path, outputs);
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
