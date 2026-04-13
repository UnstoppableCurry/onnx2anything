"""
ONNX to TFLite Converter

This module provides conversion from ONNX format to TensorFlow Lite format.
Optimized for Pyodide (WASM) environment with minimal dependencies.
"""

import json
import os
import sys
import struct
from typing import Dict, List, Tuple, Optional, Any, Union
from io import BytesIO


class TFLiteConverter:
    """
    ONNX to TensorFlow Lite converter.

    Supports:
        - Standard FP32 conversion
n        - FP16 quantization
        - INT8 quantization (post-training)
        - Dynamic range quantization
    """

    def __init__(self, logger=None):
        """
        Initialize the converter.

        Args:
            logger: Optional logger instance for progress reporting
        """
        self.logger = logger
        self.temp_dir = '/tmp/onnx_tflite'
        os.makedirs(self.temp_dir, exist_ok=True)

    def _log(self, level: str, message: str, stage: str = "", percent: int = 0):
        """Log a message if logger is available."""
        if self.logger:
            if hasattr(self.logger, 'log'):
                self.logger.log(level, message, stage, percent)
            elif hasattr(self.logger, 'info') and level == "INFO":
                self.logger.info(message, stage, percent)
            elif hasattr(self.logger, 'warn') and level == "WARN":
                self.logger.warn(message, stage, percent)
            elif hasattr(self.logger, 'error') and level == "ERROR":
                self.logger.error(message, stage, percent)

    def _check_dependencies(self) -> Dict[str, bool]:
        """
        Check which dependencies are available.

        Returns:
            Dictionary mapping dependency names to availability
        """
        deps = {
            "onnx": False,
            "onnxsim": False,
            "tensorflow": False,
            "onnx2tf": False,
            "numpy": False,
        }

        for dep in deps.keys():
            try:
                __import__(dep)
                deps[dep] = True
            except ImportError:
                pass

        return deps

    def convert(self,
                onnx_path: str,
                output_path: str,
                options: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Convert ONNX model to TFLite format.

        Args:
            onnx_path: Path to input ONNX model
            output_path: Path for output TFLite model
            options: Conversion options dictionary
                - quantization: 'none', 'fp16', 'int8', 'dynamic'
                - input_shapes: Dict of input name to shape
                - optimization: bool, apply optimizations
                - calibration_data: Optional calibration data for INT8
                - target_platform: 'default', 'edgetpu', 'micro'

        Returns:
            Dictionary with conversion results
        """
        options = options or {}
        quantization = options.get("quantization", "none")

        self._log("INFO", f"Starting TFLite conversion with {quantization} quantization",
                  "converting", 40)

        deps = self._check_dependencies()

        # Strategy selection based on available dependencies
        if deps["onnx2tf"] and deps["tensorflow"]:
            return self._convert_with_onnx2tf(onnx_path, output_path, options, deps)
        elif deps["tensorflow"]:
            return self._convert_with_tf_direct(onnx_path, output_path, options, deps)
        else:
            return self._convert_fallback(onnx_path, output_path, options)

    def _convert_with_onnx2tf(self,
                               onnx_path: str,
                               output_path: str,
                               options: Dict,
                               deps: Dict) -> Dict[str, Any]:
        """
        Convert using onnx2tf library (preferred method).
        """
        try:
            from onnx2tf import convert

            self._log("INFO", "Using onnx2tf converter", "converting", 45)

            # Build conversion options
            convert_opts = {
                "input_onnx_file_path": onnx_path,
                "output_folder_path": os.path.dirname(output_path),
                "output_tflite_file_path": output_path,
                "overwrite_input_shape": options.get("input_shapes"),
                "no_large_tensor": options.get("no_large_tensor", False),
                "verbosity": "info" if options.get("verbose") else "error",
                "copy_onnx_input_output_names_to_tflite": True,
            }

            # Apply optimizations
            if options.get("optimization", True):
                convert_opts["optimization"] = True

            # Handle quantization
            quantize = options.get("quantization", "none")

            if quantize == "fp16":
                self._log("INFO", "Applying FP16 quantization", "quantizing", 75)
                convert_opts["output_float16_quantized_tflite"] = True

            elif quantize == "int8":
                self._log("INFO", "Applying INT8 quantization", "quantizing", 75)
                convert_opts["output_integer_quantized_tflite"] = True
                convert_opts["quant_type"] = "per-channel"

                # Calibration data for INT8
                calib_data = options.get("calibration_data")
                if calib_data:
                    convert_opts["quant_calib_input_op_name_np_data_path"] = calib_data
                else:
                    # Default representative dataset
                    convert_opts["quant_calib_input_op_name_np_data_path"] = None

            elif quantize == "dynamic":
                self._log("INFO", "Applying dynamic range quantization", "quantizing", 75)
                convert_opts["output_dynamic_range_quantized_tflite"] = True

            # Target platform
            platform = options.get("target_platform", "default")
            if platform == "edgetpu":
                convert_opts["output_edgetpu"] = True

            # Execute conversion
            convert(**convert_opts)

            if os.path.exists(output_path):
                output_size = os.path.getsize(output_path)
                self._log("INFO", f"TFLite conversion complete: {output_size} bytes",
                          "converting", 90)

                return {
                    "success": True,
                    "output_path": output_path,
                    "output_size": output_size,
                    "quantization": quantize,
                    "method": "onnx2tf",
                    "message": f"Successfully converted to TFLite ({quantize} quantization)"
                }
            else:
                return {
                    "success": False,
                    "error": "Output file was not created",
                    "method": "onnx2tf"
                }

        except Exception as e:
            self._log("ERROR", f"onnx2tf conversion failed: {str(e)}", "converting", 0)
            # Fall back to alternative method
            return self._convert_with_tf_direct(onnx_path, output_path, options, deps)

    def _convert_with_tf_direct(self,
                                 onnx_path: str,
                                 output_path: str,
                                 options: Dict,
                                 deps: Dict) -> Dict[str, Any]:
        """
        Convert using TensorFlow's native converter.
        Requires ONNX model to be loaded and converted to TF first.
        """
        try:
            import tensorflow as tf
            import onnx
            from onnx import numpy_helper

            self._log("INFO", "Using TensorFlow direct converter", "converting", 45)

            # Load ONNX model
            onnx_model = onnx.load(onnx_path)

            # Convert to TensorFlow (basic implementation)
            # Note: Full implementation would use onnx-tf or tf-onnx
            self._log("INFO", "Converting ONNX to TensorFlow format", "converting", 50)

            # This is a simplified placeholder - actual implementation
            # would require onnx-tf or similar library
            return {
                "success": False,
                "error": "Direct TensorFlow conversion requires onnx-tf package which is not available in WASM",
                "fallback_available": True,
                "method": "tf_direct"
            }

        except Exception as e:
            self._log("ERROR", f"TensorFlow conversion failed: {str(e)}", "converting", 0)
            return self._convert_fallback(onnx_path, output_path, options)

    def _convert_fallback(self,
                          onnx_path: str,
                          output_path: str,
                          options: Dict) -> Dict[str, Any]:
        """
        Fallback conversion when full libraries are not available.
        Provides information about the model and suggests alternatives.
        """
        self._log("WARN", "Full conversion libraries not available in WASM environment",
                  "converting", 0)

        try:
            import onnx

            # Load model to get info
            model = onnx.load(onnx_path)

            # Collect model information
            node_count = len(model.graph.node)
            input_count = len(model.graph.input)
            output_count = len(model.graph.output)

            # Get operator types
            op_types = {}
            for node in model.graph.node:
                op_types[node.op_type] = op_types.get(node.op_type, 0) + 1

            self._log("INFO", f"Model info: {node_count} nodes, {input_count} inputs, {output_count} outputs",
                      "analyzing", 50)

            return {
                "success": False,
                "error": "TFLite conversion requires onnx2tf or TensorFlow which are not available in WASM",
                "wasm_limitation": True,
                "model_info": {
                    "node_count": node_count,
                    "input_count": input_count,
                    "output_count": output_count,
                    "operators": op_types,
                    "opset_version": model.opset_import[0].version if model.opset_import else None,
                },
                "recommendation": "Use server-side conversion for this model, or download the ONNX model and convert locally with onnx2tf"
            }

        except Exception as e:
            return {
                "success": False,
                "error": f"Fallback analysis failed: {str(e)}",
                "wasm_limitation": True
            }

    def quantize_model(self,
                       input_path: str,
                       output_path: str,
                       quantization: str,
                       calibration_data: Optional[Any] = None) -> Dict[str, Any]:
        """
        Apply quantization to an existing TFLite model.

        Args:
            input_path: Path to input TFLite model
            output_path: Path for output quantized model
            quantization: Quantization type ('fp16', 'int8', 'dynamic')
            calibration_data: Calibration data for INT8 quantization

        Returns:
            Dictionary with quantization results
        """
        try:
            import tensorflow as tf

            self._log("INFO", f"Applying {quantization} quantization", "quantizing", 80)

            # Load model
            converter = tf.lite.TFLiteConverter.from_saved_model(input_path)

            if quantization == "fp16":
                converter.optimizations = [tf.lite.Optimize.DEFAULT]
                converter.target_spec.supported_types = [tf.float16]

            elif quantization == "int8":
                converter.optimizations = [tf.lite.Optimize.DEFAULT]
                converter.representative_dataset = calibration_data or self._default_representative_dataset

            elif quantization == "dynamic":
                converter.optimizations = [tf.lite.Optimize.DEFAULT]

            # Convert
            tflite_model = converter.convert()

            # Save
            with open(output_path, 'wb') as f:
                f.write(tflite_model)

            input_size = os.path.getsize(input_path)
            output_size = os.path.getsize(output_path)
            reduction = (input_size - output_size) / input_size * 100

            self._log("INFO", f"Quantization complete: {reduction:.1f}% size reduction",
                      "quantizing", 95)

            return {
                "success": True,
                "input_size": input_size,
                "output_size": output_size,
                "reduction_percent": reduction,
                "quantization": quantization
            }

        except ImportError:
            return {
                "success": False,
                "error": "TensorFlow not available for quantization"
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Quantization failed: {str(e)}"
            }

    def _default_representative_dataset(self):
        """Generate default representative dataset for INT8 calibration."""
        # This should be customized based on actual model input
        for _ in range(100):
            yield [tf.random.normal([1, 224, 224, 3])]

    def get_supported_ops(self) -> List[str]:
        """
        Get list of ONNX operators supported for TFLite conversion.

        Returns:
            List of supported operator names
        """
        return [
            "Conv", "ConvTranspose", "AveragePool", "MaxPool", "GlobalAveragePool",
            "BatchNormalization", "InstanceNormalization", "LayerNormalization",
            "Relu", "Relu6", "LeakyRelu", "Sigmoid", "Tanh", "Softmax",
            "Add", "Sub", "Mul", "Div", "Pow", "Sqrt", "Exp", "Log",
            "Concat", "Split", "Transpose", "Reshape", "Flatten", "Squeeze", "Unsqueeze",
            "Gather", "Slice", "Pad", "Resize", "Upsample",
            "MatMul", "Gemm", "LSTM", "GRU", "RNN",
            "ReduceMean", "ReduceSum", "ReduceMax", "ReduceMin",
            "Cast", "Clip", "Abs", "Neg", "Ceil", "Floor", "Round",
            "Equal", "Greater", "Less", "Not", "And", "Or", "Xor",
            "Where", "Expand", "Tile", "Range", "Shape", "Constant",
        ]

    def estimate_conversion_complexity(self, onnx_path: str) -> Dict[str, Any]:
        """
        Estimate the complexity of converting a model.

        Args:
            onnx_path: Path to ONNX model

        Returns:
            Dictionary with complexity assessment
        """
        try:
            import onnx

            model = onnx.load(onnx_path)
            node_count = len(model.graph.node)

            # Count operators by type
            op_counts = {}
            for node in model.graph.node:
                op_counts[node.op_type] = op_counts.get(node.op_type, 0) + 1

            # Identify potentially problematic ops
            complex_ops = ['LSTM', 'GRU', 'RNN', 'Loop', 'If', 'Scan', 'Sequence']
            has_complex_ops = any(op in op_counts for op in complex_ops)

            # Check for dynamic shapes
            has_dynamic_shapes = False
            for inp in model.graph.input:
                for dim in inp.type.tensor_type.shape.dim:
                    if dim.dim_param:  # Dynamic dimension
                        has_dynamic_shapes = True
                        break

            # Estimate time (rough heuristic)
            if node_count < 50:
                estimated_time = "< 10 seconds"
                complexity = "low"
            elif node_count < 200:
                estimated_time = "10-30 seconds"
                complexity = "medium"
            else:
                estimated_time = "> 30 seconds"
                complexity = "high"

            if has_complex_ops:
                complexity = "high"
                estimated_time += " (complex ops detected)"

            return {
                "node_count": node_count,
                "operator_counts": op_counts,
                "has_complex_ops": has_complex_ops,
                "has_dynamic_shapes": has_dynamic_shapes,
                "complexity": complexity,
                "estimated_time": estimated_time,
                "likely_success": not has_complex_ops or complexity != "high"
            }

        except Exception as e:
            return {
                "error": str(e),
                "complexity": "unknown"
            }
