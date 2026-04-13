#!/usr/bin/env python3
"""
验证转换结果的 Python 脚本
用于验证 ONNX 到其他格式的转换质量
"""

import os
import sys
import argparse
import json
import hashlib
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import numpy as np

def check_dependencies():
    """检查必要的依赖"""
    missing = []

    try:
        import onnx
    except ImportError:
        missing.append("onnx")

    try:
        import onnxruntime as ort
    except ImportError:
        missing.append("onnxruntime")

    if missing:
        print(f"错误: 缺少必要的依赖: {', '.join(missing)}")
        print(f"请运行: pip install {' '.join(missing)}")
        sys.exit(1)

def validate_onnx_model(model_path: str) -> Dict:
    """
    验证 ONNX 模型有效性

    Args:
        model_path: ONNX 模型文件路径

    Returns:
        验证结果字典
    """
    import onnx
    import onnxruntime as ort

    result = {
        "valid": False,
        "file_path": model_path,
        "file_size_mb": 0,
        "errors": [],
        "warnings": [],
        "info": {}
    }

    try:
        # 检查文件存在
        if not os.path.exists(model_path):
            result["errors"].append(f"文件不存在: {model_path}")
            return result

        # 文件大小
        file_size = os.path.getsize(model_path)
        result["file_size_mb"] = round(file_size / (1024 * 1024), 2)

        if file_size == 0:
            result["errors"].append("文件为空")
            return result

        # 加载模型
        try:
            model = onnx.load(model_path)
        except Exception as e:
            result["errors"].append(f"无法加载模型: {e}")
            return result

        # 基础验证
        try:
            onnx.checker.check_model(model)
            result["valid"] = True
        except Exception as e:
            result["errors"].append(f"模型验证失败: {e}")

        # 提取信息
        result["info"] = {
            "ir_version": model.ir_version,
            "opset_version": model.opset_import[0].version if model.opset_import else None,
            "producer_name": model.producer_name or "Unknown",
            "producer_version": model.producer_version or "Unknown",
            "doc": model.doc_string or "",
            "graph_name": model.graph.name if model.graph else None,
            "num_inputs": len(model.graph.input) if model.graph else 0,
            "num_outputs": len(model.graph.output) if model.graph else 0,
            "num_nodes": len(model.graph.node) if model.graph else 0,
            "num_initializers": len(model.graph.initializer) if model.graph else 0,
        }

        # 算子统计
        if model.graph:
            op_types = {}
            for node in model.graph.node:
                op_types[node.op_type] = op_types.get(node.op_type, 0) + 1
            result["info"]["op_types"] = op_types

        # 尝试使用 ONNX Runtime 推理验证
        try:
            session = ort.InferenceSession(model_path)
            result["info"]["runtime_valid"] = True

            # 输入信息
            inputs = []
            for inp in session.get_inputs():
                inputs.append({
                    "name": inp.name,
                    "shape": inp.shape,
                    "type": inp.type
                })
            result["info"]["inputs"] = inputs

            # 输出信息
            outputs = []
            for out in session.get_outputs():
                outputs.append({
                    "name": out.name,
                    "shape": out.shape,
                    "type": out.type
                })
            result["info"]["outputs"] = outputs

        except Exception as e:
            result["warnings"].append(f"ONNX Runtime 验证失败: {e}")
            result["info"]["runtime_valid"] = False

    except Exception as e:
        result["errors"].append(f"验证过程中出错: {e}")

    return result

def validate_tflite_model(model_path: str) -> Dict:
    """
    验证 TFLite 模型有效性

    Args:
        model_path: TFLite 模型文件路径

    Returns:
        验证结果字典
    """
    result = {
        "valid": False,
        "file_path": model_path,
        "file_size_mb": 0,
        "errors": [],
        "warnings": [],
        "info": {}
    }

    try:
        import tensorflow as tf

        if not os.path.exists(model_path):
            result["errors"].append(f"文件不存在: {model_path}")
            return result

        file_size = os.path.getsize(model_path)
        result["file_size_mb"] = round(file_size / (1024 * 1024), 2)

        # 加载模型
        try:
            interpreter = tf.lite.Interpreter(model_path=model_path)
            interpreter.allocate_tensors()
            result["valid"] = True

            # 获取张量信息
            input_details = interpreter.get_input_details()
            output_details = interpreter.get_output_details()

            result["info"] = {
                "num_inputs": len(input_details),
                "num_outputs": len(output_details),
                "inputs": [
                    {
                        "name": inp["name"],
                        "shape": list(inp["shape"]),
                        "dtype": str(inp["dtype"]),
                        "quantization": inp.get("quantization", None)
                    }
                    for inp in input_details
                ],
                "outputs": [
                    {
                        "name": out["name"],
                        "shape": list(out["shape"]),
                        "dtype": str(out["dtype"]),
                        "quantization": out.get("quantization", None)
                    }
                    for out in output_details
                ]
            }

        except Exception as e:
            result["errors"].append(f"TFLite 模型加载失败: {e}")

    except ImportError:
        result["errors"].append("未安装 tensorflow")

    return result

def compare_models(
    source_path: str,
    converted_path: str,
    format_type: str
) -> Dict:
    """
    比较原始模型和转换后模型

    Args:
        source_path: 原始 ONNX 模型路径
        converted_path: 转换后模型路径
        format_type: 目标格式 (tflite, openvino, mnn, paddlelite, etc.)

    Returns:
        比较结果
    """
    result = {
        "source_valid": False,
        "converted_valid": False,
        "comparison": {},
        "errors": []
    }

    # 验证源模型
    source_result = validate_onnx_model(source_path)
    result["source_valid"] = source_result["valid"]
    result["source_info"] = source_result["info"]

    if not source_result["valid"]:
        result["errors"].extend(source_result["errors"])

    # 验证转换后模型
    if format_type == "tflite":
        converted_result = validate_tflite_model(converted_path)
    else:
        # 其他格式的验证
        converted_result = {
            "valid": os.path.exists(converted_path),
            "file_size_mb": os.path.getsize(converted_path) / (1024 * 1024) if os.path.exists(converted_path) else 0,
            "errors": [],
            "warnings": [
                f"{format_type} 格式仅做文件存在性验证；"
                "逐张量输出一致性请改用 scripts/compare_edge_framework_outputs.mjs"
            ],
            "info": {}
        }

    result["converted_valid"] = converted_result["valid"]
    result["converted_info"] = converted_result["info"]

    if not converted_result["valid"]:
        result["errors"].extend(converted_result["errors"])

    # 比较信息
    if source_result["valid"] and converted_result["valid"]:
        source_size = source_result["file_size_mb"]
        converted_size = converted_result["file_size_mb"]

        result["comparison"] = {
            "source_size_mb": source_size,
            "converted_size_mb": converted_size,
            "size_reduction_mb": round(source_size - converted_size, 2),
            "size_reduction_percent": round((1 - converted_size / source_size) * 100, 2) if source_size > 0 else 0,
            "input_shape_match": False,
            "output_shape_match": False
        }

        # 比较输入形状
        source_inputs = source_result["info"].get("inputs", [])
        converted_inputs = converted_result["info"].get("inputs", [])

        if len(source_inputs) == len(converted_inputs):
            input_matches = []
            for s_inp, c_inp in zip(source_inputs, converted_inputs):
                # 处理动态维度
                s_shape = s_inp.get("shape", [])
                c_shape = c_inp.get("shape", [])

                # 简化比较：检查维度数量
                match = len(s_shape) == len(c_shape)
                input_matches.append(match)

            result["comparison"]["input_shape_match"] = all(input_matches)

        # 比较输出形状
        source_outputs = source_result["info"].get("outputs", [])
        converted_outputs = converted_result["info"].get("outputs", [])

        if len(source_outputs) == len(converted_outputs):
            output_matches = []
            for s_out, c_out in zip(source_outputs, converted_outputs):
                s_shape = s_out.get("shape", [])
                c_shape = c_out.get("shape", [])
                match = len(s_shape) == len(c_shape)
                output_matches.append(match)

            result["comparison"]["output_shape_match"] = all(output_matches)

    return result

def generate_report(results: List[Dict], output_path: Optional[str] = None) -> str:
    """
    生成验证报告

    Args:
        results: 验证结果列表
        output_path: 输出文件路径（可选）

    Returns:
        报告字符串
    """
    report_lines = []
    report_lines.append("=" * 70)
    report_lines.append("ONNX2Anything 转换验证报告")
    report_lines.append("=" * 70)
    report_lines.append("")

    total = len(results)
    passed = sum(1 for r in results if r.get("converted_valid", False))
    failed = total - passed

    report_lines.append(f"总验证数: {total}")
    report_lines.append(f"通过: {passed}")
    report_lines.append(f"失败: {failed}")
    report_lines.append("")

    for i, result in enumerate(results, 1):
        report_lines.append(f"--- 验证 #{i} ---")

        if "source_info" in result:
            report_lines.append(f"源模型: {result.get('source_info', {}).get('graph_name', 'Unknown')}")
            report_lines.append(f"  - 输入数: {result['source_info'].get('num_inputs', 0)}")
            report_lines.append(f"  - 输出数: {result['source_info'].get('num_outputs', 0)}")
            report_lines.append(f"  - 节点数: {result['source_info'].get('num_nodes', 0)}")

        report_lines.append(f"验证状态: {'✓ 通过' if result.get('converted_valid') else '✗ 失败'}")

        if "comparison" in result and result["comparison"]:
            comp = result["comparison"]
            report_lines.append(f"  - 源模型大小: {comp.get('source_size_mb', 0):.2f} MB")
            report_lines.append(f"  - 转换后大小: {comp.get('converted_size_mb', 0):.2f} MB")
            report_lines.append(f"  - 大小减少: {comp.get('size_reduction_percent', 0):.1f}%")
            report_lines.append(f"  - 输入形状匹配: {'是' if comp.get('input_shape_match') else '否'}")
            report_lines.append(f"  - 输出形状匹配: {'是' if comp.get('output_shape_match') else '否'}")

        if result.get("errors"):
            report_lines.append("错误:")
            for error in result["errors"]:
                report_lines.append(f"  - {error}")

        report_lines.append("")

    report = "\n".join(report_lines)

    if output_path:
        with open(output_path, "w") as f:
            f.write(report)
        print(f"报告已保存到: {output_path}")

    return report

def main():
    parser = argparse.ArgumentParser(
        description="验证 ONNX 模型转换结果",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 验证单个 ONNX 模型
  python verify-conversion.py --source model.onnx

  # 验证转换结果
  python verify-conversion.py --source model.onnx --converted model.tflite --format tflite

  # 批量验证并生成报告
  python verify-conversion.py --batch batch.json --report report.txt
        """
    )

    parser.add_argument("--source", "-s", help="源 ONNX 模型文件路径")
    parser.add_argument("--converted", "-c", help="转换后的模型文件路径")
    parser.add_argument("--format", "-f", default="tflite",
                        choices=["tflite", "openvino", "mnn", "paddlelite"],
                        help="转换目标格式")
    parser.add_argument("--batch", "-b", help="批量验证的 JSON 配置文件")
    parser.add_argument("--report", "-r", help="输出报告文件路径")
    parser.add_argument("--json", "-j", action="store_true",
                        help="输出 JSON 格式结果")

    args = parser.parse_args()

    # 检查依赖
    check_dependencies()

    results = []

    if args.batch:
        # 批量验证
        with open(args.batch, "r") as f:
            batch_config = json.load(f)

        for item in batch_config:
            source = item.get("source")
            converted = item.get("converted")
            fmt = item.get("format", "tflite")

            if source and converted:
                result = compare_models(source, converted, fmt)
                results.append(result)

    elif args.source and args.converted:
        # 单个比较验证
        result = compare_models(args.source, args.converted, args.format)
        results.append(result)

    elif args.source:
        # 仅验证源模型
        result = validate_onnx_model(args.source)
        results.append(result)

    else:
        parser.print_help()
        sys.exit(1)

    # 输出结果
    if args.json:
        print(json.dumps(results, indent=2))
    else:
        report = generate_report(results, args.report)
        if not args.report:
            print(report)

    # 返回退出码
    failed_count = sum(1 for r in results if not r.get("converted_valid", r.get("valid", False)))
    sys.exit(0 if failed_count == 0 else 1)

if __name__ == "__main__":
    main()
