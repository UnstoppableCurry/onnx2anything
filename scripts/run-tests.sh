#!/bin/bash
#
# ONNX2Anything 测试运行脚本
# 运行所有测试套件
#

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# 测试配置
TEST_TIMEOUT=300000  # 5分钟
COVERAGE_THRESHOLD=70

# 帮助信息
show_help() {
    cat << EOF
ONNX2Anything 测试运行脚本

用法: $(basename "$0") [选项] [测试套件]

测试套件:
    all         运行所有测试 (默认)
    unit        仅运行单元测试
    e2e         仅运行 E2E 测试
    perf        仅运行性能测试
    model       运行模型相关测试
    yolo        运行 YOLO 特定测试

选项:
    -h, --help          显示帮助信息
    -c, --coverage      生成覆盖率报告
    -w, --watch         监视模式运行
    -u, --update        更新快照
    -v, --verbose       详细输出
    -s, --serial        串行运行 (不并行)
    --headed            以有头模式运行 E2E 测试
    --ui                打开 Vitest UI

示例:
    $(basename "$0")                  # 运行所有测试
    $(basename "$0") unit             # 仅运行单元测试
    $(basename "$0") e2e --headed     # 以有头模式运行 E2E 测试
    $(basename "$0") all -c           # 运行所有测试并生成覆盖率报告
EOF
}

# 打印带颜色的消息
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查依赖
check_dependencies() {
    log_info "检查依赖..."

    if ! command -v node &> /dev/null; then
        log_error "未找到 Node.js"
        exit 1
    fi

    if ! command -v npm &> /dev/null; then
        log_error "未找到 npm"
        exit 1
    fi

    # 检查 package.json 是否存在
    if [ ! -f "$PROJECT_ROOT/package.json" ]; then
        log_error "未找到 package.json"
        exit 1
    fi

    log_success "依赖检查通过"
}

# 安装依赖 (如果需要)
install_dependencies() {
    if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
        log_info "安装依赖..."
        cd "$PROJECT_ROOT" && npm install
    fi
}

# 运行单元测试
run_unit_tests() {
    log_info "运行单元测试..."

    local cmd="npx vitest run tests/unit"

    if [ "$COVERAGE" = true ]; then
        cmd="$cmd --coverage"
    fi

    if [ "$WATCH" = true ]; then
        cmd="npx vitest tests/unit"
    fi

    if [ "$UPDATE_SNAPSHOT" = true ]; then
        cmd="$cmd -u"
    fi

    if [ "$VERBOSE" = true ]; then
        cmd="$cmd --reporter=verbose"
    fi

    if [ "$SERIAL" = true ]; then
        cmd="$cmd --pool=forks --poolOptions.forks.singleFork"
    fi

    cd "$PROJECT_ROOT" && eval "$cmd"

    if [ $? -eq 0 ]; then
        log_success "单元测试通过"
    else
        log_error "单元测试失败"
        return 1
    fi
}

# 运行 E2E 测试
run_e2e_tests() {
    log_info "运行 E2E 测试..."

    # 检查 Playwright 是否安装
    if ! command -v npx playwright &> /dev/null; then
        log_warn "Playwright 未安装，跳过 E2E 测试"
        log_info "安装 Playwright: npm install -D @playwright/test && npx playwright install"
        return 0
    fi

    local cmd="npx playwright test tests/e2e"

    if [ "$HEADED" = true ]; then
        cmd="$cmd --headed"
    fi

    if [ "$VERBOSE" = true ]; then
        cmd="$cmd --reporter=list"
    fi

    # 确保测试应用已构建或运行
    if [ -z "$CI" ]; then
        log_warn "确保开发服务器在 http://localhost:5173 运行"
        log_info "可以运行: npm run dev"
    fi

    cd "$PROJECT_ROOT" && eval "$cmd"

    if [ $? -eq 0 ]; then
        log_success "E2E 测试通过"
    else
        log_error "E2E 测试失败"
        return 1
    fi
}

# 运行性能测试
run_perf_tests() {
    log_info "运行性能测试..."

    local cmd="npx vitest run tests/perf"

    cd "$PROJECT_ROOT" && eval "$cmd"

    if [ $? -eq 0 ]; then
        log_success "性能测试通过"
    else
        log_warn "性能测试发现问题"
        return 1
    fi
}

# 运行模型相关测试
run_model_tests() {
    log_info "运行模型相关测试..."

    # 检查测试模型是否存在
    local fixtures_dir="$PROJECT_ROOT/tests/fixtures"

    if [ ! -d "$fixtures_dir" ] || [ -z "$(ls -A "$fixtures_dir"/*.onnx 2>/dev/null)" ]; then
        log_warn "测试模型不存在，生成测试模型..."

        if command -v python3 &> /dev/null; then
            cd "$PROJECT_ROOT" && python3 tests/fixtures/generate_dummy_models.py --output-dir "$fixtures_dir"
        else
            log_error "未找到 Python，无法生成测试模型"
            return 1
        fi
    fi

    # 运行 YOLO 相关测试
    local cmd="npx vitest run tests/unit --reporter=verbose"

    cd "$PROJECT_ROOT" && eval "$cmd"

    if [ $? -eq 0 ]; then
        log_success "模型测试通过"
    else
        log_error "模型测试失败"
        return 1
    fi
}

# 运行 YOLO 特定测试
run_yolo_tests() {
    log_info "运行 YOLO 特定测试..."

    # 生成 YOLO-like 模型
    cd "$PROJECT_ROOT" && python3 tests/fixtures/generate_dummy_models.py --model yolov5
    cd "$PROJECT_ROOT" && python3 tests/fixtures/generate_dummy_models.py --model yolov8

    # 运行相关测试
    npx vitest run tests/unit -t "YOLO"

    if [ $? -eq 0 ]; then
        log_success "YOLO 测试通过"
    else
        log_error "YOLO 测试失败"
        return 1
    fi
}

# 生成测试报告
generate_report() {
    log_info "生成测试报告..."

    local report_dir="$PROJECT_ROOT/test-results"
    mkdir -p "$report_dir"

    # 合并测试输出
    if [ -f "$report_dir/junit.xml" ]; then
        log_info "JUnit 报告: $report_dir/junit.xml"
    fi

    if [ -d "$PROJECT_ROOT/coverage" ]; then
        log_info "覆盖率报告: $PROJECT_ROOT/coverage/index.html"
    fi

    # 生成摘要
    cat > "$report_dir/summary.txt" << EOF
ONNX2Anything 测试摘要
======================
生成时间: $(date)

测试套件:
- 单元测试: tests/unit/
- E2E 测试: tests/e2e/
- 性能测试: tests/perf/

测试模型:
- 位置: tests/fixtures/
- 类型: YOLOv5n, YOLOv8n, ResNet50 等

覆盖率阈值: ${COVERAGE_THRESHOLD}%

更多信息请查看:
- coverage/index.html (覆盖率报告)
- test-results/junit.xml (JUnit 格式结果)
EOF

    log_info "测试摘要: $report_dir/summary.txt"
}

# 打开 Vitest UI
open_vitest_ui() {
    log_info "启动 Vitest UI..."
    cd "$PROJECT_ROOT" && npx vitest --ui
}

# 主函数
main() {
    # 默认参数
    TEST_SUITE="all"
    COVERAGE=false
    WATCH=false
    UPDATE_SNAPSHOT=false
    VERBOSE=false
    SERIAL=false
    HEADED=false
    UI=false

    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -c|--coverage)
                COVERAGE=true
                shift
                ;;
            -w|--watch)
                WATCH=true
                shift
                ;;
            -u|--update)
                UPDATE_SNAPSHOT=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -s|--serial)
                SERIAL=true
                shift
                ;;
            --headed)
                HEADED=true
                shift
                ;;
            --ui)
                UI=true
                shift
                ;;
            unit|e2e|perf|model|yolo|all)
                TEST_SUITE="$1"
                shift
                ;;
            *)
                log_error "未知选项: $1"
                show_help
                exit 1
                ;;
        esac
    done

    # 如果请求 UI 模式
    if [ "$UI" = true ]; then
        open_vitest_ui
        exit 0
    fi

    log_info "ONNX2Anything 测试运行器"
    log_info "测试套件: $TEST_SUITE"

    # 检查和安装依赖
    check_dependencies
    install_dependencies

    # 创建测试输出目录
    mkdir -p "$PROJECT_ROOT/test-results"

    # 根据测试套件运行相应测试
    local exit_code=0

    case $TEST_SUITE in
        unit)
            run_unit_tests || exit_code=1
            ;;
        e2e)
            run_e2e_tests || exit_code=1
            ;;
        perf)
            run_perf_tests || exit_code=1
            ;;
        model)
            run_model_tests || exit_code=1
            ;;
        yolo)
            run_yolo_tests || exit_code=1
            ;;
        all)
            run_unit_tests || exit_code=1
            run_e2e_tests || exit_code=1
            run_perf_tests || exit_code=1
            ;;
        *)
            log_error "未知测试套件: $TEST_SUITE"
            exit 1
            ;;
    esac

    # 生成报告
    if [ "$COVERAGE" = true ]; then
        generate_report
    fi

    # 最终状态
    echo ""
    if [ $exit_code -eq 0 ]; then
        log_success "所有测试完成!"
    else
        log_error "部分测试失败!"
    fi

    exit $exit_code
}

# 运行主函数
main "$@"
