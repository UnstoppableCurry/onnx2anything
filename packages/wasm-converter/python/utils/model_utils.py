"""
Model Utilities for ONNX2Anything

This module provides utility functions for model validation, analysis,
and preprocessing. Designed to work in Pyodide (WASM) environment.
"""

import json
import os
import struct
import math
from typing import Dict, List, Tuple, Optional, Any, Union, BinaryIO
from io import BytesIO


class ModelValidator:
    """
    ONNX model validator.

    Validates ONNX model structure, checks for common issues,
    and provides detailed model information.
    """

    def __init__(self, logger=None):
        """
        Initialize validator.

        Args:
            logger: Optional logger instance
        """
        self.logger = logger

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

    def validate(self, model_path: str, check_shapes: bool = True) -> Dict[str, Any]:
        """
        Validate an ONNX model.

        Args:
            model_path: Path to ONNX model file
            check_shapes: Whether to check shape information

        Returns:
            Validation results dictionary
        """
        self._log("INFO", f"Starting validation of {model_path}", "validating", 0)

        try:
            import onnx

            # Check file existence
            if not os.path.exists(model_path):
                return {
                    "success": False,
                    "valid": False,
                    "error": "Model file not found",
                    "path": model_path
                }

            # Check file size
            file_size = os.path.getsize(model_path)
            self._log("INFO", f"File size: {self._format_size(file_size)}", "validating", 5)

            # Check magic number (ONNX files start with 0x08)
            with open(model_path, 'rb') as f:
                magic = f.read(4)
                if not magic or magic[0] != 0x08:
                    return {
                        "success": False,
                        "valid": False,
                        "error": "File does not appear to be a valid ONNX model (wrong magic number)",
                        "path": model_path
                    }

            # Load model
            self._log("INFO", "Loading ONNX model", "validating", 10)
            try:
                model = onnx.load(model_path)
            except Exception as e:
                return {
                    "success": False,
                    "valid": False,
                    "error": f"Failed to load model: {str(e)}",
                    "path": model_path
                }

            # Basic structure validation
            if not model.graph:
                return {
                    "success": False,
                    "valid": False,
                    "error": "Model has no graph",
                    "path": model_path
                }

            # Check IR version
            ir_version = model.ir_version
            self._log("INFO", f"IR version: {ir_version}", "validating", 15)

            # Check opset imports
            opset_imports = {}
            for imp in model.opset_import:
                domain = imp.domain if imp.domain else "ai.onnx"
                opset_imports[domain] = imp.version

            self._log("INFO", f"Opset imports: {opset_imports}", "validating", 20)

            # Check inputs/outputs
            inputs = list(model.graph.input)
            outputs = list(model.graph.output)
            initializers = list(model.graph.initializer)

            if len(inputs) == 0:
                return {
                    "success": False,
                    "valid": False,
                    "error": "Model has no inputs",
                    "path": model_path
                }

            if len(outputs) == 0:
                return {
                    "success": False,
                    "valid": False,
                    "error": "Model has no outputs",
                    "path": model_path
                }

            self._log("INFO", f"Inputs: {len(inputs)}, Outputs: {len(outputs)}, Initializers: {len(initializers)}",
                      "validating", 25)

            # Run ONNX checker
            self._log("INFO", "Running ONNX checker", "validating", 30)
            try:
                onnx.checker.check_model(model)
                checker_passed = True
            except Exception as e:
                checker_passed = False
                checker_error = str(e)
                self._log("WARN", f"ONNX checker warning: {checker_error}", "validating", 35)

            # Additional validations
            warnings = []
            errors = []

            # Check for large tensors
            for init in initializers:
                tensor_size = 1
                for dim in init.dims:
                    tensor_size *= dim

                # Warn if tensor is very large (> 100MB of floats)
                if tensor_size > 25 * 1024 * 1024:  # 25M floats ~ 100MB
                    warnings.append(f"Large tensor '{init.name}': {tensor_size} elements")

            # Check for dynamic shapes
            dynamic_inputs = []
            for inp in inputs:
                for dim in inp.type.tensor_type.shape.dim:
                    if dim.dim_param:
                        dynamic_inputs.append(inp.name)
                        break

            if dynamic_inputs:
                warnings.append(f"Dynamic shapes detected in inputs: {dynamic_inputs}")

            # Check for unsupported ops (basic check)
            unsupported_ops = self._check_unsupported_ops(model)
            if unsupported_ops:
                warnings.append(f"Potentially unsupported ops: {unsupported_ops}")

            # Shape inference check
            shape_info = {}
            if check_shapes:
                shape_info = self._check_shapes(model)

            # Compile results
            result = {
                "success": True,
                "valid": checker_passed,
                "path": model_path,
                "file_size": file_size,
                "file_size_formatted": self._format_size(file_size),
                "ir_version": ir_version,
                "opset_imports": opset_imports,
                "graph": {
                    "node_count": len(model.graph.node),
                    "input_count": len(inputs),
                    "output_count": len(outputs),
                    "initializer_count": len(initializers),
                    "value_info_count": len(model.graph.value_info),
                    "sparse_initializer_count": len(model.graph.sparse_initializer),
                },
                "inputs": [{"name": inp.name} for inp in inputs],
                "outputs": [{"name": out.name} for out in outputs],
                "warnings": warnings,
                "shape_info": shape_info,
            }

            if not checker_passed:
                result["checker_error"] = checker_error

            self._log("INFO", f"Validation complete. Valid: {checker_passed}", "validating", 100)
            return result

        except ImportError:
            return {
                "success": False,
                "valid": False,
                "error": "ONNX library not available",
                "path": model_path
            }
        except Exception as e:
            return {
                "success": False,
                "valid": False,
                "error": f"Validation failed: {str(e)}",
                "path": model_path
            }

    def _format_size(self, size_bytes: int) -> str:
        """Format byte size to human readable string."""
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size_bytes < 1024.0:
                return f"{size_bytes:.2f} {unit}"
            size_bytes /= 1024.0
        return f"{size_bytes:.2f} TB"

    def _check_unsupported_ops(self, model) -> List[str]:
        """Check for potentially unsupported ops."""
        # Ops that may cause issues in common converters
        potentially_problematic = {
            'Loop', 'If', 'Scan', 'Sequence', 'Optional',
            'Trilu', 'Unique', 'NonMaxSuppression',
        }

        found = []
        for node in model.graph.node:
            if node.op_type in potentially_problematic:
                found.append(node.op_type)

        return list(set(found))

    def _check_shapes(self, model) -> Dict[str, Any]:
        """Check and collect shape information."""
        shape_info = {
            "inputs": [],
            "outputs": [],
            "has_dynamic_shapes": False
        }

        for inp in model.graph.input:
            tensor_type = inp.type.tensor_type
            shape = []
            for dim in tensor_type.shape.dim:
                if dim.dim_value:
                    shape.append(dim.dim_value)
                elif dim.dim_param:
                    shape.append(f"dynamic({dim.dim_param})")
                    shape_info["has_dynamic_shapes"] = True
                else:
                    shape.append("unknown")

            shape_info["inputs"].append({
                "name": inp.name,
                "shape": shape,
                "dtype": self._dtype_to_string(tensor_type.elem_type)
            })

        for out in model.graph.output:
            tensor_type = out.type.tensor_type
            shape = []
            for dim in tensor_type.shape.dim:
                if dim.dim_value:
                    shape.append(dim.dim_value)
                elif dim.dim_param:
                    shape.append(f"dynamic({dim.dim_param})")
                    shape_info["has_dynamic_shapes"] = True
                else:
                    shape.append("unknown")

            shape_info["outputs"].append({
                "name": out.name,
                "shape": shape,
                "dtype": self._dtype_to_string(tensor_type.elem_type)
            })

        return shape_info

    def _dtype_to_string(self, dtype: int) -> str:
        """Convert ONNX dtype to string."""
        dtype_map = {
            0: "UNDEFINED", 1: "FLOAT", 2: "UINT8", 3: "INT8",
            4: "UINT16", 5: "INT16", 6: "INT32", 7: "INT64",
            8: "STRING", 9: "BOOL", 10: "FLOAT16", 11: "DOUBLE",
            12: "UINT32", 13: "UINT64", 14: "COMPLEX64", 15: "COMPLEX128",
            16: "BFLOAT16"
        }
        return dtype_map.get(dtype, f"UNKNOWN({dtype})")


class ModelSimplifier:
    """
    ONNX model simplifier using onnx-simplifier.
    """

    def __init__(self, logger=None):
        self.logger = logger

    def _log(self, level: str, message: str, stage: str = "", percent: int = 0):
        """Log a message if logger is available."""
        if self.logger:
            if hasattr(self.logger, 'log'):
                self.logger.log(level, message, stage, percent)
            elif hasattr(self.logger, 'info') and level == "INFO":
                self.logger.info(message, stage, percent)

    def simplify(self,
                 input_path: str,
                 output_path: str,
                 options: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Simplify an ONNX model.

        Args:
            input_path: Path to input ONNX model
            output_path: Path for output simplified model
            options: Simplification options
                - skip_optimization: Skip optimization passes
                - skip_shape_inference: Skip shape inference
                - overwrite_input_shapes: Dict of input name to shape
                - skipped_optimizers: List of optimizers to skip

        Returns:
            Simplification results
        """
        options = options or {}

        self._log("INFO", "Starting model simplification", "simplifying", 0)

        try:
            import onnx
            from onnxsim import simplify

            # Load model
            self._log("INFO", "Loading model", "simplifying", 10)
            model = onnx.load(input_path)

            original_node_count = len(model.graph.node)
            self._log("INFO", f"Original model: {original_node_count} nodes", "simplifying", 20)

            # Build simplify options
            simplify_opts = {
                "perform_optimization": not options.get("skip_optimization", False),
                "skip_shape_inference": options.get("skip_shape_inference", False),
            }

            if options.get("overwrite_input_shapes"):
                simplify_opts["overwrite_input_shapes"] = options["overwrite_input_shapes"]

            if options.get("skipped_optimizers"):
                simplify_opts["skipped_optimizers"] = options["skipped_optimizers"]

            # Run simplification
            self._log("INFO", "Running simplifier", "simplifying", 40)
            model_simp, check = simplify(model, **simplify_opts)

            simplified_node_count = len(model_simp.graph.node)
            reduction = original_node_count - simplified_node_count
            reduction_pct = (reduction / original_node_count * 100) if original_node_count > 0 else 0

            self._log("INFO", f"Simplified: {original_node_count} -> {simplified_node_count} nodes "
                      f"({reduction_pct:.1f}% reduction)", "simplifying", 80)

            # Save result
            self._log("INFO", "Saving simplified model", "simplifying", 90)
            onnx.save(model_simp, output_path)

            result = {
                "success": True,
                "check_passed": check,
                "original_nodes": original_node_count,
                "simplified_nodes": simplified_node_count,
                "reduction": reduction,
                "reduction_percent": reduction_pct,
                "output_path": output_path
            }

            if not check:
                result["warning"] = "Simplification check failed - model may have issues"
                self._log("WARN", "Simplification validation check failed", "simplifying", 95)

            self._log("INFO", "Simplification complete", "simplifying", 100)
            return result

        except ImportError as e:
            return {
                "success": False,
                "error": f"Required library not available: {str(e)}"
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Simplification failed: {str(e)}"
            }


class ModelAnalyzer:
    """
    ONNX model analyzer for detailed inspection.
    """

    def __init__(self, logger=None):
        self.logger = logger

    def analyze(self, model_path: str) -> Dict[str, Any]:
        """
        Perform comprehensive model analysis.

        Args:
            model_path: Path to ONNX model

        Returns:
            Analysis results
        """
        try:
            import onnx

            model = onnx.load(model_path)

            # Basic info
            analysis = {
                "success": True,
                "model_info": {
                    "ir_version": model.ir_version,
                    "producer_name": model.producer_name or "Unknown",
                    "producer_version": model.producer_version or "Unknown",
                    "doc_string": model.doc_string or "",
                    "domain": model.domain or "",
                    "model_version": model.model_version,
                },
                "opset": [
                    {"domain": imp.domain or "ai.onnx", "version": imp.version}
                    for imp in model.opset_import
                ],
            }

            # Graph analysis
            graph = model.graph
            analysis["graph"] = {
                "name": graph.name or "",
                "node_count": len(graph.node),
                "input_count": len(graph.input),
                "output_count": len(graph.output),
                "initializer_count": len(graph.initializer),
                "sparse_initializer_count": len(graph.sparse_initializer),
                "value_info_count": len(graph.value_info),
            }

            # Operator statistics
            op_counts = {}
            for node in graph.node:
                op_counts[node.op_type] = op_counts.get(node.op_type, 0) + 1

            analysis["operators"] = {
                "unique_count": len(op_counts),
                "total_count": sum(op_counts.values()),
                "counts": dict(sorted(op_counts.items(), key=lambda x: x[1], reverse=True))
            }

            # Parameter count
            total_params = 0
            param_details = []

            for init in graph.initializer:
                size = 1
                for dim in init.dims:
                    size *= dim
                total_params += size

                param_details.append({
                    "name": init.name,
                    "shape": list(init.dims),
                    "size": size,
                    "dtype": self._dtype_to_string(init.data_type)
                })

            analysis["parameters"] = {
                "total_count": total_params,
                "initializer_count": len(graph.initializer),
                "largest_initializers": sorted(param_details, key=lambda x: x["size"], reverse=True)[:10]
            }

            # Input/Output details
            analysis["inputs"] = []
            for inp in graph.input:
                tensor_type = inp.type.tensor_type
                shape = []
                for dim in tensor_type.shape.dim:
                    if dim.dim_value:
                        shape.append(dim.dim_value)
                    elif dim.dim_param:
                        shape.append(f"dynamic:{dim.dim_param}")
                    else:
                        shape.append("?")

                analysis["inputs"].append({
                    "name": inp.name,
                    "shape": shape,
                    "dtype": self._dtype_to_string(tensor_type.elem_type)
                })

            analysis["outputs"] = []
            for out in graph.output:
                tensor_type = out.type.tensor_type
                shape = []
                for dim in tensor_type.shape.dim:
                    if dim.dim_value:
                        shape.append(dim.dim_value)
                    elif dim.dim_param:
                        shape.append(f"dynamic:{dim.dim_param}")
                    else:
                        shape.append("?")

                analysis["outputs"].append({
                    "name": out.name,
                    "shape": shape,
                    "dtype": self._dtype_to_string(tensor_type.elem_type)
                })

            return analysis

        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    def _dtype_to_string(self, dtype: int) -> str:
        """Convert ONNX dtype to string."""
        dtype_map = {
            0: "UNDEFINED", 1: "FLOAT", 2: "UINT8", 3: "INT8",
            4: "UINT16", 5: "INT16", 6: "INT32", 7: "INT64",
            8: "STRING", 9: "BOOL", 10: "FLOAT16", 11: "DOUBLE",
            12: "UINT32", 13: "UINT64", 14: "COMPLEX64", 15: "COMPLEX128",
            16: "BFLOAT16"
        }
        return dtype_map.get(dtype, f"UNKNOWN({dtype})")


class ProgressTracker:
    """
    Tracks conversion progress and reports via callback.
    """

    def __init__(self, callback=None):
        """
        Initialize progress tracker.

        Args:
            callback: Function to call with progress updates (stage, percent, message)
        """
        self.callback = callback
        self.stages = {}
        self.current_stage = None

    def start_stage(self, stage: str, message: str = ""):
        """Start a new processing stage."""
        self.current_stage = stage
        self.stages[stage] = {
            "start_percent": self._get_stage_start_percent(stage),
            "end_percent": self._get_stage_end_percent(stage),
            "message": message
        }

        if self.callback:
            self.callback(stage, self.stages[stage]["start_percent"], message)

    def update(self, percent_in_stage: float, message: str = ""):
        """Update progress within current stage."""
        if self.current_stage and self.current_stage in self.stages:
            stage_info = self.stages[self.current_stage]
            total_percent = int(stage_info["start_percent"] +
                               (stage_info["end_percent"] - stage_info["start_percent"]) *
                               (percent_in_stage / 100.0))

            if self.callback:
                self.callback(self.current_stage, total_percent,
                             message or stage_info["message"])

    def end_stage(self, message: str = ""):
        """End current stage."""
        if self.current_stage and self.current_stage in self.stages:
            stage_info = self.stages[self.current_stage]

            if self.callback:
                self.callback(self.current_stage, stage_info["end_percent"],
                             message or f"{self.current_stage} complete")

    def _get_stage_start_percent(self, stage: str) -> int:
        """Get starting percent for a stage."""
        stage_order = {
            "loading": 0,
            "validating": 5,
            "analyzing": 10,
            "simplifying": 20,
            "converting": 40,
            "quantizing": 75,
            "finalizing": 90,
            "done": 100
        }
        return stage_order.get(stage, 0)

    def _get_stage_end_percent(self, stage: str) -> int:
        """Get ending percent for a stage."""
        stage_order = {
            "loading": 5,
            "validating": 10,
            "analyzing": 20,
            "simplifying": 40,
            "converting": 75,
            "quantizing": 90,
            "finalizing": 100,
            "done": 100
        }
        return stage_order.get(stage, 100)


def estimate_memory_usage(model_path: str) -> Dict[str, Any]:
    """
    Estimate memory requirements for processing a model.

    Args:
        model_path: Path to model file

    Returns:
        Memory estimation results
    """
    try:
        file_size = os.path.getsize(model_path)

        # Rough estimates based on typical memory patterns
        estimates = {
            "file_size": file_size,
            "file_size_formatted": _format_bytes(file_size),
            "loading_memory": file_size * 3,  # ~3x for loaded model
            "simplification_memory": file_size * 5,  # ~5x during simplification
            "conversion_memory": file_size * 8,  # ~8x during conversion
            "peak_memory": file_size * 10,  # ~10x peak
        }

        # Format all sizes
        for key in list(estimates.keys()):
            if key.endswith("_memory"):
                estimates[key + "_formatted"] = _format_bytes(estimates[key])

        # WASM considerations
        estimates["wasm_feasible"] = estimates["peak_memory"] < 2 * 1024 * 1024 * 1024  # 2GB
        estimates["recommendations"] = []

        if not estimates["wasm_feasible"]:
            estimates["recommendations"].append(
                "Model may be too large for browser-based conversion. "
                "Consider server-side conversion or model pruning."
            )

        return estimates

    except Exception as e:
        return {
            "error": str(e)
        }


def _format_bytes(size_bytes: int) -> str:
    """Format bytes to human readable string."""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} TB"


def validate_input_shapes(model_path: str, input_shapes: Dict[str, List[int]]) -> Dict[str, Any]:
    """
    Validate input shapes against model requirements.

    Args:
        model_path: Path to ONNX model
        input_shapes: Proposed input shapes

    Returns:
        Validation results
    """
    try:
        import onnx

        model = onnx.load(model_path)

        results = {
            "success": True,
            "valid": True,
            "inputs": [],
            "errors": [],
            "warnings": []
        }

        input_dict = {inp.name: inp for inp in model.graph.input}

        for name, shape in input_shapes.items():
            if name not in input_dict:
                results["errors"].append(f"Input '{name}' not found in model")
                results["valid"] = False
                continue

            inp = input_dict[name]
            tensor_type = inp.type.tensor_type
            model_shape = []

            for dim in tensor_type.shape.dim:
                if dim.dim_value:
                    model_shape.append(dim.dim_value)
                elif dim.dim_param:
                    model_shape.append(f"dynamic({dim.dim_param})")
                else:
                    model_shape.append(None)

            # Check rank
            if len(shape) != len(model_shape):
                results["errors"].append(
                    f"Input '{name}' rank mismatch: model expects {len(model_shape)}, got {len(shape)}"
                )
                results["valid"] = False
                continue

            # Check dimensions
            for i, (model_dim, provided_dim) in enumerate(zip(model_shape, shape)):
                if model_dim is None or (isinstance(model_dim, str) and model_dim.startswith("dynamic")):
                    # Dynamic dimension - any value is valid
                    continue

                if model_dim != provided_dim:
                    results["warnings"].append(
                        f"Input '{name}' dimension {i}: model expects {model_dim}, got {provided_dim}"
                    )

            results["inputs"].append({
                "name": name,
                "model_shape": model_shape,
                "provided_shape": shape
            })

        return results

    except Exception as e:
        return {
            "success": False,
            "valid": False,
            "error": str(e)
        }
