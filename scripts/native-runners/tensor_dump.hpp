#pragma once

#include <cstddef>
#include <cstdint>
#include <fstream>
#include <iomanip>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace onnx2anything {

struct TensorDump {
  std::vector<int64_t> shape;
  std::vector<float> data;
};

inline std::size_t element_count(const std::vector<int64_t>& shape) {
  if (shape.empty()) {
    return 1;
  }

  std::size_t count = 1;
  for (const auto dim : shape) {
    if (dim < 0) {
      throw std::runtime_error("Negative dimensions are not supported in tensor dump");
    }
    count *= static_cast<std::size_t>(dim);
  }
  return count;
}

inline std::vector<TensorDump> read_tensor_dump(const std::string& path) {
  std::ifstream stream(path);
  if (!stream) {
    throw std::runtime_error("Failed to open tensor dump: " + path);
  }

  std::size_t tensor_count = 0;
  if (!(stream >> tensor_count)) {
    throw std::runtime_error("Failed to read tensor count from: " + path);
  }

  std::vector<TensorDump> tensors;
  tensors.reserve(tensor_count);

  for (std::size_t tensor_index = 0; tensor_index < tensor_count; ++tensor_index) {
    std::size_t dims_count = 0;
    if (!(stream >> dims_count)) {
      throw std::runtime_error("Failed to read tensor rank from: " + path);
    }

    TensorDump tensor;
    tensor.shape.reserve(dims_count);
    for (std::size_t dim_index = 0; dim_index < dims_count; ++dim_index) {
      int64_t dim = 0;
      if (!(stream >> dim)) {
        throw std::runtime_error("Failed to read tensor dimension from: " + path);
      }
      tensor.shape.push_back(dim);
    }

    std::size_t value_count = 0;
    if (!(stream >> value_count)) {
      throw std::runtime_error("Failed to read tensor value count from: " + path);
    }

    const auto expected_values = element_count(tensor.shape);
    if (value_count != expected_values) {
      std::ostringstream message;
      message << "Tensor value count mismatch in " << path << ": expected " << expected_values
              << " but got " << value_count;
      throw std::runtime_error(message.str());
    }

    tensor.data.reserve(value_count);
    for (std::size_t value_index = 0; value_index < value_count; ++value_index) {
      float value = 0.0f;
      if (!(stream >> value)) {
        throw std::runtime_error("Failed to read tensor value from: " + path);
      }
      tensor.data.push_back(value);
    }

    tensors.push_back(std::move(tensor));
  }

  return tensors;
}

inline void write_tensor_dump(const std::string& path, const std::vector<TensorDump>& tensors) {
  std::ofstream stream(path);
  if (!stream) {
    throw std::runtime_error("Failed to open output tensor dump: " + path);
  }

  stream << tensors.size() << '\n';
  stream << std::setprecision(9);

  for (const auto& tensor : tensors) {
    stream << tensor.shape.size();
    for (const auto dim : tensor.shape) {
      stream << ' ' << dim;
    }
    stream << '\n';

    stream << tensor.data.size() << '\n';
    for (std::size_t index = 0; index < tensor.data.size(); ++index) {
      if (index > 0) {
        stream << ' ';
      }
      stream << tensor.data[index];
    }
    stream << '\n';
  }
}

}  // namespace onnx2anything
