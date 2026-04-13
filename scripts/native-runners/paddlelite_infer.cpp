#include <algorithm>
#include <cstdint>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

#include "lite/api/paddle_api.h"
#include "lite/api/paddle_place.h"
#include "tensor_dump.hpp"

namespace {

std::vector<int64_t> to_paddle_shape(const std::vector<int64_t>& shape) {
  return shape;
}

std::size_t element_count(const std::vector<int64_t>& shape) {
  return onnx2anything::element_count(shape);
}

std::string shape_to_string(const std::vector<int64_t>& shape) {
  std::string text = "[";
  for (std::size_t index = 0; index < shape.size(); ++index) {
    if (index > 0) {
      text += ", ";
    }
    text += std::to_string(shape[index]);
  }
  text += "]";
  return text;
}

#if defined(LITE_WITH_ARM)
constexpr auto kInputTarget = paddle::lite_api::TargetType::kARM;
#else
constexpr auto kInputTarget = paddle::lite_api::TargetType::kHost;
#endif

template <typename T>
bool copy_precision_data(const paddle::lite_api::Tensor& output_tensor,
                         std::vector<float>* output) {
  const auto* values = output_tensor.data<T>();
  if (values == nullptr) {
    return false;
  }
  for (std::size_t index = 0; index < output->size(); ++index) {
    (*output)[index] = static_cast<float>(values[index]);
  }
  return true;
}

}  // namespace

int main(int argc, char** argv) {
  if (argc != 4) {
    std::cerr << "Usage: paddlelite_infer <modelPath> <inputDumpPath> <outputDumpPath>\n";
    return 1;
  }

  try {
    const std::string model_path = argv[1];
    const std::string input_dump_path = argv[2];
    const std::string output_dump_path = argv[3];

    const auto inputs = onnx2anything::read_tensor_dump(input_dump_path);
    if (inputs.size() != 1) {
      throw std::runtime_error("Paddle Lite runner currently supports exactly one input tensor");
    }

    paddle::lite_api::MobileConfig config;
    config.set_model_from_file(model_path);
    config.set_threads(1);
    config.set_power_mode(paddle::lite_api::PowerMode::LITE_POWER_NO_BIND);
    auto predictor = paddle::lite_api::CreatePaddlePredictor(config);

    auto input_tensor = predictor->GetInput(0);
    if (!input_tensor) {
      throw std::runtime_error("Failed to resolve Paddle Lite input tensor");
    }

    input_tensor->Resize(to_paddle_shape(inputs[0].shape));
    input_tensor->CopyFromCpu<float, kInputTarget>(inputs[0].data.data());

    predictor->Run();

    const auto output_names = predictor->GetOutputNames();
    if (output_names.empty()) {
      throw std::runtime_error("Paddle Lite predictor reported no outputs");
    }

    std::vector<onnx2anything::TensorDump> outputs;
    outputs.reserve(output_names.size());
    for (std::size_t index = 0; index < output_names.size(); ++index) {
      auto output_tensor = predictor->GetOutput(static_cast<int>(index));
      if (!output_tensor) {
        throw std::runtime_error("Failed to resolve Paddle Lite output tensor");
      }

      onnx2anything::TensorDump dump;
      dump.shape = output_tensor->shape();
      dump.data.resize(element_count(dump.shape));

      bool copied = false;
      switch (output_tensor->precision()) {
        case paddle::lite_api::PrecisionType::kFloat:
          copied = copy_precision_data<float>(*output_tensor, &dump.data);
          break;
        case paddle::lite_api::PrecisionType::kInt32:
          copied = copy_precision_data<int32_t>(*output_tensor, &dump.data);
          break;
        case paddle::lite_api::PrecisionType::kInt64:
          copied = copy_precision_data<int64_t>(*output_tensor, &dump.data);
          break;
        case paddle::lite_api::PrecisionType::kInt16:
          copied = copy_precision_data<int16_t>(*output_tensor, &dump.data);
          break;
        case paddle::lite_api::PrecisionType::kInt8:
          copied = copy_precision_data<int8_t>(*output_tensor, &dump.data);
          break;
        case paddle::lite_api::PrecisionType::kUInt8:
          copied = copy_precision_data<uint8_t>(*output_tensor, &dump.data);
          break;
        default:
          copied = false;
          break;
      }

      if (!copied) {
        throw std::runtime_error(
            "Paddle Lite output tensor returned a null buffer for output " +
            output_names[index] +
            " with shape " +
            shape_to_string(dump.shape) +
            ", initialized=" +
            std::string(output_tensor->IsInitialized() ? "true" : "false") +
            ", precision " +
            paddle::lite_api::PrecisionToStr(output_tensor->precision()) +
            " on target " +
            paddle::lite_api::TargetToStr(output_tensor->target()));
      }

      outputs.push_back(std::move(dump));
    }

    onnx2anything::write_tensor_dump(output_dump_path, outputs);
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
