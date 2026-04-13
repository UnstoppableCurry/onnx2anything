"""
生成测试用的 ONNX 模型文件

此脚本生成用于测试的小型 ONNX 模型，不需要真实训练权重。
用于快速单元测试和 CI/CD 环境。
"""

import os
import argparse
from typing import List, Tuple, Optional
import numpy as np

try:
    import onnx
    from onnx import helper, TensorProto, numpy_helper
except ImportError:
    print("错误: 需要安装 onnx 包")
    print("pip install onnx numpy")
    raise


def create_tensor_value_info(
    name: str,
    tensor_type: int,
    shape: List[Optional[int]]
) -> onnx.ValueInfoProto:
    """创建张量值信息"""
    return helper.make_tensor_value_info(name, tensor_type, shape)


def generate_minimal_model(output_path: str) -> None:
    """
    生成最小的有效 ONNX 模型
    用于基本功能测试
    """
    # 输入: [batch, 3, 640, 640]
    input_tensor = create_tensor_value_info(
        "input", TensorProto.FLOAT, [1, 3, 640, 640]
    )

    # 输出: [batch, 10]
    output_tensor = create_tensor_value_info(
        "output", TensorProto.FLOAT, [1, 10]
    )

    # 创建一个简单的 Identity 节点
    node = helper.make_node(
        "Identity",
        inputs=["input"],
        outputs=["output"],
        name="identity_node"
    )

    # 创建图
    graph = helper.make_graph(
        nodes=[node],
        name="minimal_model",
        inputs=[input_tensor],
        outputs=[output_tensor],
    )

    # 创建模型
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 12)])
    model.ir_version = 8

    # 验证并保存
    onnx.checker.check_model(model)
    onnx.save(model, output_path)
    print(f"✓ 生成最小模型: {output_path}")


def generate_conv_model(output_path: str) -> None:
    """
    生成仅包含卷积层的模型
    模拟简单的特征提取
    """
    # 输入
    input_tensor = create_tensor_value_info(
        "input", TensorProto.FLOAT, [1, 3, 224, 224]
    )

    # Conv 权重 [16, 3, 3, 3]
    conv_weights = numpy_helper.from_array(
        np.random.randn(16, 3, 3, 3).astype(np.float32),
        name="conv_weights"
    )

    # Conv 偏置 [16]
    conv_bias = numpy_helper.from_array(
        np.random.randn(16).astype(np.float32),
        name="conv_bias"
    )

    # Conv 节点
    conv_node = helper.make_node(
        "Conv",
        inputs=["input", "conv_weights", "conv_bias"],
        outputs=["conv_output"],
        kernel_shape=[3, 3],
        pads=[1, 1, 1, 1],
        strides=[1, 1],
        name="conv1"
    )

    # ReLU 节点
    relu_node = helper.make_node(
        "Relu",
        inputs=["conv_output"],
        outputs=["output"],
        name="relu1"
    )

    # 输出 [1, 16, 224, 224]
    output_tensor = create_tensor_value_info(
        "output", TensorProto.FLOAT, [1, 16, 224, 224]
    )

    # 创建图
    graph = helper.make_graph(
        nodes=[conv_node, relu_node],
        name="conv_model",
        inputs=[input_tensor],
        outputs=[output_tensor],
        initializer=[conv_weights, conv_bias]
    )

    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 12)])
    model.ir_version = 8

    onnx.checker.check_model(model)
    onnx.save(model, output_path)
    print(f"✓ 生成卷积模型: {output_path}")


def generate_yolo_like_model(output_path: str, version: str = "v5") -> None:
    """
    生成模拟 YOLO 结构的简化模型
    包含常见的 YOLO 算子
    """
    nodes = []
    initializers = []
    current_output = "input"

    # 输入
    input_shape = [1, 3, 640, 640]
    input_tensor = create_tensor_value_info(
        "input", TensorProto.FLOAT, input_shape
    )

    # 模拟 YOLO backbone 的一些层
    channels = [3, 32, 64, 128]

    for i in range(len(channels) - 1):
        in_ch = channels[i]
        out_ch = channels[i + 1]

        # Conv 权重
        weight_name = f"conv{i}_w"
        bias_name = f"conv{i}_b"

        weights = numpy_helper.from_array(
            np.random.randn(out_ch, in_ch, 3, 3).astype(np.float32) * 0.1,
            name=weight_name
        )
        bias = numpy_helper.from_array(
            np.random.randn(out_ch).astype(np.float32) * 0.1,
            name=bias_name
        )
        initializers.extend([weights, bias])

        # Conv
        conv_output = f"conv{i}_out"
        conv_node = helper.make_node(
            "Conv",
            inputs=[current_output, weight_name, bias_name],
            outputs=[conv_output],
            kernel_shape=[3, 3],
            pads=[1, 1, 1, 1],
            strides=[2, 2],
            name=f"conv{i}"
        )
        nodes.append(conv_node)

        # BatchNorm (简化版)
        bn_output = f"bn{i}_out"
        bn_node = helper.make_node(
            "BatchNormalization",
            inputs=[conv_output, f"bn{i}_s", f"bn{i}_b", f"bn{i}_m", f"bn{i}_v"],
            outputs=[bn_output],
            name=f"bn{i}"
        )
        # BN 参数
        scale = numpy_helper.from_array(
            np.ones(out_ch).astype(np.float32), name=f"bn{i}_s"
        )
        bias = numpy_helper.from_array(
            np.zeros(out_ch).astype(np.float32), name=f"bn{i}_b"
        )
        mean = numpy_helper.from_array(
            np.zeros(out_ch).astype(np.float32), name=f"bn{i}_m"
        )
        var = numpy_helper.from_array(
            np.ones(out_ch).astype(np.float32), name=f"bn{i}_v"
        )
        initializers.extend([scale, bias, mean, var])
        nodes.append(bn_node)

        # LeakyReLU / SiLU
        relu_output = f"relu{i}_out"
        if version == "v5":
            relu_node = helper.make_node(
                "LeakyRelu",
                inputs=[bn_output],
                outputs=[relu_output],
                alpha=0.1,
                name=f"leaky{i}"
            )
        else:  # v8
            # SiLU 用 Sigmoid + Mul 模拟
            sigmoid_output = f"sigmoid{i}_out"
            sigmoid_node = helper.make_node(
                "Sigmoid",
                inputs=[bn_output],
                outputs=[sigmoid_output],
                name=f"silu_sigmoid{i}"
            )
            nodes.append(sigmoid_node)

            relu_node = helper.make_node(
                "Mul",
                inputs=[bn_output, sigmoid_output],
                outputs=[relu_output],
                name=f"silu_mul{i}"
            )
        nodes.append(relu_node)

        current_output = relu_output

    # 添加上采样 (YOLO 特征图融合)
    upsample_output = "upsample_out"
    upsample_node = helper.make_node(
        "Resize",
        inputs=[current_output, "", "", "upsample_scales"],
        outputs=[upsample_output],
        mode="nearest",
        name="upsample"
    )
    scales = numpy_helper.from_array(
        np.array([1.0, 1.0, 2.0, 2.0], dtype=np.float32),
        name="upsample_scales"
    )
    initializers.append(scales)
    nodes.append(upsample_node)

    current_output = upsample_output

    # Concat
    concat_output = "concat_out"
    concat_node = helper.make_node(
        "Concat",
        inputs=[current_output, current_output],  # 自己拼接
        outputs=[concat_output],
        axis=1,
        name="concat"
    )
    nodes.append(concat_node)

    current_output = concat_output

    # 最终输出层
    output_tensor = create_tensor_value_info(
        "output", TensorProto.FLOAT, [1, 256, 80, 80]
    )

    # 创建图
    graph = helper.make_graph(
        nodes=nodes,
        name=f"yolo{version}_like_model",
        inputs=[input_tensor],
        outputs=[output_tensor],
        initializer=initializers
    )

    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 13)])
    model.ir_version = 8

    onnx.checker.check_model(model)
    onnx.save(model, output_path)
    print(f"✓ 生成 YOLO{version}-like 模型: {output_path} ({len(nodes)} nodes)")


def generate_resnet_like_model(output_path: str) -> None:
    """
    生成模拟 ResNet 结构的简化模型
    """
    nodes = []
    initializers = []
    current_output = "input"

    # 输入
    input_tensor = create_tensor_value_info(
        "input", TensorProto.FLOAT, [1, 3, 224, 224]
    )

    # 简化的 ResNet block
    def add_resnet_block(input_name: str, in_ch: int, out_ch: int, stride: int = 1) -> str:
        """添加一个 ResNet block"""
        nonlocal nodes, initializers

        # 主分支
        # Conv1
        w1_name = f"block{len(nodes)}_conv1_w"
        b1_name = f"block{len(nodes)}_conv1_b"
        w1 = numpy_helper.from_array(
            np.random.randn(out_ch, in_ch, 3, 3).astype(np.float32) * 0.1,
            name=w1_name
        )
        b1 = numpy_helper.from_array(
            np.random.randn(out_ch).astype(np.float32) * 0.1,
            name=b1_name
        )
        initializers.extend([w1, b1])

        conv1_out = f"block{len(nodes)}_conv1"
        conv1 = helper.make_node(
            "Conv",
            inputs=[input_name, w1_name, b1_name],
            outputs=[conv1_out],
            kernel_shape=[3, 3],
            pads=[1, 1, 1, 1],
            strides=[stride, stride],
            name=f"conv{len(nodes)}_1"
        )
        nodes.append(conv1)

        # BN1
        bn1_out = f"block{len(nodes)}_bn1"
        s1_name = f"bn{len(nodes)}_1_s"
        b1_name_bn = f"bn{len(nodes)}_1_b"
        s1 = numpy_helper.from_array(np.ones(out_ch).astype(np.float32), name=s1_name)
        b1_bn = numpy_helper.from_array(np.zeros(out_ch).astype(np.float32), name=b1_name_bn)
        initializers.extend([s1, b1_bn])

        bn1 = helper.make_node(
            "BatchNormalization",
            inputs=[conv1_out, s1_name, b1_name_bn, f"bn{len(nodes)}_1_m", f"bn{len(nodes)}_1_v"],
            outputs=[bn1_out],
            name=f"bn{len(nodes)}_1"
        )
        m1 = numpy_helper.from_array(np.zeros(out_ch).astype(np.float32), name=f"bn{len(nodes)}_1_m")
        v1 = numpy_helper.from_array(np.ones(out_ch).astype(np.float32), name=f"bn{len(nodes)}_1_v")
        initializers.extend([m1, v1])
        nodes.append(bn1)

        # ReLU
        relu1_out = f"block{len(nodes)}_relu1"
        relu1 = helper.make_node(
            "Relu",
            inputs=[bn1_out],
            outputs=[relu1_out],
            name=f"relu{len(nodes)}_1"
        )
        nodes.append(relu1)

        # Conv2
        w2_name = f"block{len(nodes)}_conv2_w"
        b2_name = f"block{len(nodes)}_conv2_b"
        w2 = numpy_helper.from_array(
            np.random.randn(out_ch, out_ch, 3, 3).astype(np.float32) * 0.1,
            name=w2_name
        )
        b2 = numpy_helper.from_array(
            np.random.randn(out_ch).astype(np.float32) * 0.1,
            name=b2_name
        )
        initializers.extend([w2, b2])

        conv2_out = f"block{len(nodes)}_conv2"
        conv2 = helper.make_node(
            "Conv",
            inputs=[relu1_out, w2_name, b2_name],
            outputs=[conv2_out],
            kernel_shape=[3, 3],
            pads=[1, 1, 1, 1],
            strides=[1, 1],
            name=f"conv{len(nodes)}_2"
        )
        nodes.append(conv2)

        # Shortcut (如果需要)
        shortcut = input_name
        if stride != 1 or in_ch != out_ch:
            shortcut_name = f"block{len(nodes)}_shortcut"
            w_s_name = f"shortcut{len(nodes)}_w"
            b_s_name = f"shortcut{len(nodes)}_b"
            w_s = numpy_helper.from_array(
                np.random.randn(out_ch, in_ch, 1, 1).astype(np.float32) * 0.1,
                name=w_s_name
            )
            b_s = numpy_helper.from_array(
                np.random.randn(out_ch).astype(np.float32) * 0.1,
                name=b_s_name
            )
            initializers.extend([w_s, b_s])

            shortcut_conv = helper.make_node(
                "Conv",
                inputs=[input_name, w_s_name, b_s_name],
                outputs=[shortcut_name],
                kernel_shape=[1, 1],
                pads=[0, 0, 0, 0],
                strides=[stride, stride],
                name=f"shortcut{len(nodes)}"
            )
            nodes.append(shortcut_conv)
            shortcut = shortcut_name

        # Add
        add_out = f"block{len(nodes)}_add"
        add_node = helper.make_node(
            "Add",
            inputs=[conv2_out, shortcut],
            outputs=[add_out],
            name=f"add{len(nodes)}"
        )
        nodes.append(add_node)

        # Final ReLU
        final_out = f"block{len(nodes)}_out"
        final_relu = helper.make_node(
            "Relu",
            inputs=[add_out],
            outputs=[final_out],
            name=f"relu{len(nodes)}_final"
        )
        nodes.append(final_relu)

        return final_out

    # 添加几个 block
    current_output = add_resnet_block(current_output, 3, 64, stride=2)
    current_output = add_resnet_block(current_output, 64, 128, stride=2)
    current_output = add_resnet_block(current_output, 128, 256, stride=2)

    # 全局平均池化
    gap_out = "gap_out"
    gap_node = helper.make_node(
        "GlobalAveragePool",
        inputs=[current_output],
        outputs=[gap_out],
        name="gap"
    )
    nodes.append(gap_node)

    # 输出
    output_tensor = create_tensor_value_info(
        "output", TensorProto.FLOAT, [1, 256]
    )

    # 创建图
    graph = helper.make_graph(
        nodes=nodes,
        name="resnet_like_model",
        inputs=[input_tensor],
        outputs=[output_tensor],
        initializer=initializers
    )

    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 13)])
    model.ir_version = 8

    onnx.checker.check_model(model)
    onnx.save(model, output_path)
    print(f"✓ 生成 ResNet-like 模型: {output_path} ({len(nodes)} nodes)")


def generate_quantization_test_model(output_path: str) -> None:
    """
    生成用于测试量化的模型
    包含可以被量化的层
    """
    nodes = []
    initializers = []

    input_tensor = create_tensor_value_info(
        "input", TensorProto.FLOAT, [1, 3, 224, 224]
    )

    # Conv 层 (通常可以被量化)
    w_name = "conv_w"
    b_name = "conv_b"
    weights = numpy_helper.from_array(
        np.random.randn(32, 3, 3, 3).astype(np.float32),
        name=w_name
    )
    bias = numpy_helper.from_array(
        np.random.randn(32).astype(np.float32),
        name=b_name
    )
    initializers.extend([weights, bias])

    conv_out = "conv_out"
    conv = helper.make_node(
        "Conv",
        inputs=["input", w_name, b_name],
        outputs=[conv_out],
        kernel_shape=[3, 3],
        pads=[1, 1, 1, 1],
        name="conv1"
    )
    nodes.append(conv)

    # BN
    bn_out = "bn_out"
    s_name = "bn_s"
    b_name_bn = "bn_b"
    scale = numpy_helper.from_array(np.ones(32).astype(np.float32), name=s_name)
    bias_bn = numpy_helper.from_array(np.zeros(32).astype(np.float32), name=b_name_bn)
    mean = numpy_helper.from_array(np.zeros(32).astype(np.float32), name="bn_m")
    var = numpy_helper.from_array(np.ones(32).astype(np.float32), name="bn_v")
    initializers.extend([scale, bias_bn, mean, var])

    bn = helper.make_node(
        "BatchNormalization",
        inputs=[conv_out, s_name, b_name_bn, "bn_m", "bn_v"],
        outputs=[bn_out],
        name="bn1"
    )
    nodes.append(bn)

    # ReLU
    relu_out = "relu_out"
    relu = helper.make_node(
        "Relu",
        inputs=[bn_out],
        outputs=[relu_out],
        name="relu1"
    )
    nodes.append(relu)

    # MatMul (全连接层)
    w_fc_name = "fc_w"
    b_fc_name = "fc_b"
    fc_weights = numpy_helper.from_array(
        np.random.randn(1000, 32 * 224 * 224).astype(np.float32),
        name=w_fc_name
    )
    fc_bias = numpy_helper.from_array(
        np.random.randn(1000).astype(np.float32),
        name=b_fc_name
    )
    initializers.extend([fc_weights, fc_bias])

    # Flatten
    flatten_out = "flatten_out"
    flatten = helper.make_node(
        "Flatten",
        inputs=[relu_out],
        outputs=[flatten_out],
        axis=1,
        name="flatten"
    )
    nodes.append(flatten)

    # FC
    fc_out = "fc_out"
    fc = helper.make_node(
        "MatMul",
        inputs=[flatten_out, w_fc_name],
        outputs=["matmul_out"],
        name="matmul"
    )
    nodes.append(fc)

    add = helper.make_node(
        "Add",
        inputs=["matmul_out", b_fc_name],
        outputs=[fc_out],
        name="fc_add"
    )
    nodes.append(add)

    output_tensor = create_tensor_value_info(
        "output", TensorProto.FLOAT, [1, 1000]
    )

    graph = helper.make_graph(
        nodes=nodes,
        name="quant_test_model",
        inputs=[input_tensor],
        outputs=[output_tensor],
        initializer=initializers
    )

    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 13)])
    model.ir_version = 8

    onnx.checker.check_model(model)
    onnx.save(model, output_path)
    print(f"✓ 生成量化测试模型: {output_path}")


def main():
    parser = argparse.ArgumentParser(description="生成测试 ONNX 模型")
    parser.add_argument(
        "--output-dir",
        default="tests/fixtures",
        help="输出目录 (默认: tests/fixtures)"
    )
    parser.add_argument(
        "--model",
        choices=["all", "minimal", "conv", "yolov5", "yolov8", "resnet", "quant"],
        default="all",
        help="要生成的模型 (默认: all)"
    )
    parser.add_argument(
        "--verify",
        action="store_true",
        help="验证生成的模型"
    )

    args = parser.parse_args()

    # 确保输出目录存在
    os.makedirs(args.output_dir, exist_ok=True)

    models_to_generate = []

    if args.model == "all":
        models_to_generate = [
            ("dummy_minimal.onnx", generate_minimal_model),
            ("dummy_conv.onnx", generate_conv_model),
            ("yolov5n_like.onnx", lambda p: generate_yolo_like_model(p, "v5")),
            ("yolov8n_like.onnx", lambda p: generate_yolo_like_model(p, "v8")),
            ("resnet50_like.onnx", generate_resnet_like_model),
            ("dummy_quant.onnx", generate_quantization_test_model),
        ]
    elif args.model == "minimal":
        models_to_generate = [("dummy_minimal.onnx", generate_minimal_model)]
    elif args.model == "conv":
        models_to_generate = [("dummy_conv.onnx", generate_conv_model)]
    elif args.model == "yolov5":
        models_to_generate = [("yolov5n_like.onnx", lambda p: generate_yolo_like_model(p, "v5"))]
    elif args.model == "yolov8":
        models_to_generate = [("yolov8n_like.onnx", lambda p: generate_yolo_like_model(p, "v8"))]
    elif args.model == "resnet":
        models_to_generate = [("resnet50_like.onnx", generate_resnet_like_model)]
    elif args.model == "quant":
        models_to_generate = [("dummy_quant.onnx", generate_quantization_test_model)]

    print(f"\n生成 {len(models_to_generate)} 个测试模型到 {args.output_dir}\n")

    for filename, generator in models_to_generate:
        output_path = os.path.join(args.output_dir, filename)
        try:
            generator(output_path)

            # 验证模型
            if args.verify:
                model = onnx.load(output_path)
                onnx.checker.check_model(model)
                print(f"  ✓ 验证通过: {filename}")

        except Exception as e:
            print(f"  ✗ 生成失败: {filename} - {e}")
            raise

    print("\n✅ 所有模型生成完成!")
    print(f"\n生成的文件:")
    for filename, _ in models_to_generate:
        filepath = os.path.join(args.output_dir, filename)
        size = os.path.getsize(filepath)
        print(f"  - {filename}: {size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
