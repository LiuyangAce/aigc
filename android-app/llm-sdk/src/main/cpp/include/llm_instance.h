#ifndef _LLM_INSTANCE_H_
#define _LLM_INSTANCE_H_

#include <string>
#include <vector>
#include <functional>

typedef void* LLM_HANDLE;
typedef void* VIT_HANDLE;
typedef void* LLM_params_ptr;
typedef void* Tokenizer_ptr;

#define VCAP_LLM_API __attribute__((visibility("default")))

namespace vla {

enum LLM_RUNTIME{
    DX3_APU     =   0,
    QCOM_NPU    =   1,
    VCAP        =   2
};

enum ModelType{
    BlueLM_7B    =   0,
    BlueLM_1B    =   1,
    BlueLM_3B    =   2,
    BlueLM_13B   =   3,
    BlueLM_V_3B  =   4,
    BlueLM_V_Class = 5
};

enum ParallelDecodeType{
    PD_Base    =   0,
    PD_LADE    =   1,
    PD_SSD     =   2,
    PD_SPEC    =   3,
    PD_Batch    =  4,
    PD_Eagle    =  5,
};

//VIT 图像数据 RGB 
struct Image_Data
{
  int input_width = 0;
  int input_height = 0;
  const uint8_t* image_buf = nullptr;
};

struct LoRA_config
{
    //必填
    std::string lora_name  = "";         //Lora 业务名字，唯一标识
    std::string lora_file  = "";    //Lora权重路径
    int lora_dtype         = 2;          //lora 权重数据类型
    std::string context_suffix = "";    // 上下文后缀, e.g: 512c, 2048c
    int n_ctx              = 512;
    int npu_power          = 20;
    bool is_context_switch = false;
    std::string prompt = "";
    //选填
    bool save_context      = false;      //是否暂存lora 的cache buffer
    float* lora_cache_base = nullptr;    //保存kv cache时，传入cache基地址指针

    //选填:Lora 相关参数，用于调用方传入的LoRA Config与vaim默认配置不一致时重新设置
    bool use_lora = false;
    float lora_alpha = 2.0f;
    int lora_r = 64;
    int lora_type = 1;                   //qkv、kv...等
    // 默认
    int lora_n_past        = 0;
};

/*
const std::string&为推理出的词
void*为指向自定义的数据指针
*/
typedef std::function<void(const std::string&, void*)> eval_callback;
struct llm_params
{
    char* model_path;
    // 对应LLM_RUNTIME
    int runtime;
    // 上下文后缀，e.g：512c, 2048c
    const char* context_suffix;
    // bluelm模型用不到这两个参数
    char* vocab_json_path;
    char* merges_path;

    // 后续方案用这个参数区分模型类别
    int model_type = BlueLM_7B;
    int seed      = -1;
    int n_threads = 4;
    int n_predict = 128;
    int n_batch   = 512;
    int n_ctx     = 512;
    // NPU 档位，高通给0 - 8, MTK给10 - 100，VCAP用不到
    int npu_power = 100;
    int decoder_power = -1;
    int priority = -100;  // 0:普通加载方案    -100：异步加载方案   -200：directio加载方案

    bool logits_all = false;
    bool embedding  = false;
    bool use_token_id = false;

    std::string input_name = "";
    std::string output_name = "";

    int compute_type = 6;//vcapllm::COMPUTE_TYPE_INT8;
    int storage_type = 1;//vcapllm::COMPUTE_TYPE_FLOAT32;
    int lora_dtype = 0;

    int tokenizer_type = 0; // 0 fast(bloom) 1 bluelm

    // sampling parameters
    int32_t top_k = 50; // unused
    float   top_p = 0.8f;
    float   temp  = 0.95f;
    float   repeat_penalty  = 1.0f;
    int parallel_decode_type = 0; // 0: base, 1: lookahead, 2: ssd, 3: spd, 4: fold_batch
    int context_cache_type = 0; // 0: default, 1: multi-round cache, 2: sliding window cache, 3: prompt cache

    bool is_context_switch = false;
    std::string prompt = "";

    std::string platformName = "SM8650";
};

struct llm_trace
{
  int init_total_time = 0;  	         //init总耗时，单位ms
  int input_tokens = 0;                //输入token数
  int output_tokens = 0;               //输出token数
  int weight_alloc_time_normal_s0 = 0; //系统不支持dio时大模型第0块权重加载耗时，单位ms
  int weight_alloc_time_normal_s1 = 0; //系统不支持dio时大模型第1块权重加载耗时，单位ms
  int weight_load_time_dio_s0 = 0;     //系统支持dio时大模型第0块权重加载耗时，单位ms
  int weight_load_time_dio_s1 = 0;     //系统支持dio时大模型第1块权重加载耗时，单位ms
  int prefill_perf = 0;                //大模型首词性能，单位token/s
  int decode_perf = 0;                 //大模型出词性能，单位token/s
  float accept_ratio = 0;			           //并行解码接收率，单位token/s
  int prefill_time = 0;	               //大模型首词总耗时
  int decode_time = 0;	               //大模型出词总耗时
  int vit_time = 0;		                 //vit耗时, 待补充
  int vit_load_time = 0;		                 //vit加载耗时, 待补充
  int vit_width = 0;                    //vit分辨率-宽度
  int vit_height = 0;                   //vit分辨率-高度
  int vit_patch_num;                    //vit切分patch数
};

enum LLM_CODE{
    LLM_SUCCESS                    = 0,
    LLM_EMPTY_RESULT               = 1,
    LLM_INTERRUPTED                = 2,
    //config&模型文件校验
    LLM_CONFIG_ERROR               = -1000,
    LLM_CONFIG_FILE_NOT_EXIST      = -1001,
    LLM_CONFIG_FILE_PARSE_ERR      = -1002,
    LLM_MODEL_VERSION_ERR          = -1003,
    LLM_MODEL_PLATFORM_ERR         = -1004,
    LLM_MODEL_FILE_NOT_EXIST       = -1100,
    LLM_MODEL_BASE_NOT_EXIST       = -1101,
    LLM_MODEL_LORA_NOT_EXIST       = -1102,
    LLM_MODEL_DRAFT_NOT_EXIST      = -1103,
    LLM_MODEL_PATH_ERR             = -1104,
    LLM_OVERTURE_FILE_NOT_EXIT     = -1105,
    //2. 模型初始化
    LLM_INIT_MODEL                 = -2000,
    LLM_INIT_FAIL                  = -2100,
    LLM_INIT_BASE_FAIL             = -2101,
    LLM_INIT_LORA_FAIL             = -2102,
    LLM_INIT_DRAFT_FAIL            = -2103,
    LLM_INIT_VIT_FAIL              = -2104,
    LLM_INIT_TOKERNIZER_FAIL       = -2105,
    LLM_LOAD_ERR                   = -2200,
    LLM_BASE_LOAD_ERR              = -2101,
    LLM_LORA_LOAD_ERR              = -2102,
    LLM_DRAFT_LOAD_ERR             = -2103,
    LLM_VIT_LOAD_ERR               = -2104,
    LLM_OVERTURE_LOAD_ERR          = -2105,
    LLM_DLOPEN_FAIL                = -2801,
    LLM_GET_FUNC_FAIL              = -2802,
    LLM_PARAM_FAIL                 = -2803,
    LLM_FREAD_FAIL                 = -2804,
    LLM_EMPTY_PTR                  = -2810,
    LLM_HANLE_EMPTY                = -2811,
    LLM_DATA_EMPTY                 = -2812,
    LLM_PARAM_PASS_ERR             = -2900,
    LLM_MEM_ALLOC_FAIL             = -2300,
    LLM_NORMAL_MEM_ALLOC_FAIL      = -2301,
    LLM_SHARED_MEM_ALLOC_FAIL      = -2302,
    LLM_ION_BUF_ALLOC_FAIL         = -2303,
    LLM_DIRECT_IO_ALLOC_FAIL       = -2304,
    LLM_QNN_INIT_ERR               = -2400,
    LLM_QNN_BACKEND_GET_ERR        = -2401,
    LLM_QNN_BACKEND_INIT_ERR       = -2402,
    LLM_QNN_CREATE_PROFILE_ERR     = -2403,
    LLM_QNN_PROFILE_INFO_ERR       = -2404,
    LLM_QNN_MODEL_INFO_ERR         = -2405,
    LLM_QNN_CONTEXT_CREATE_ERR     = -2406,
    LLM_QNN_GRAPH_CREATE_ERR       = -2407,
    LLM_QNN_FREQ_SET_ERR           = -2408,
    LLM_NEURON_INIT_ERR            = -2500,
    LLM_NEURON_FREQ_SET_ERR        = -2501,
    LLM_NEURON_GRAPH_CREATE_ERR    = -2502,
    LLM_NEURON_INFO_GET_ERR        = -2503,
    //3. 模型推理异常
    LLM_INFERENCE_ERR              = -3000,
    LLM_INFERENCE_QNN_ERR          = -3100,
    LLM_INFERENCE_QNN_GEAPH_ERR    = -3101,
    LLM_INFERENCE_NEURON_ERR       = -3200,
    LLM_INFERENCE_NEURON_GEAPH_ERR = -3201,
    LLM_LORA_SWITCH_ERR            = -3010,
    LLM_VIT_INFERENCE_ERR          = -3020,
    LLM_EAGLE_INFERENCE_ERR        = -3030,
    LLM_SWIFT_INFERENCE_ERR        = -3040,
    LLM_SNAPKV_INFERENCE_ERR       = -3050,
    LLM_KVCACHE_INFERENCE_ERR      = -3060,
    LLM_PROMPT_TOO_LONG            = -3070,
    LLM_NGRAM_INFERENCE_ERR        = -3080,
    LLM_DECODE_TOO_LONG            = -3090,
    //4.资源释放回收
    LLM_RELEASE_FAIL               = -4000,
    LLM_UNINSTALL_FAIL             = -4100,
    LLM_MODEL_UNINSTALL_FAIL       = -4101,
    LLM_LORA_UNINSTALL_FAIL        = -4102,
    LLM_DRAFT_UNINSTALL_FAIL       = -4103,
    LLM_VIT_UNINSTALL_FAIL         = -4104,
    LLM_MEM_RELEASE_FAIL           = -4200,
    LLM_NORMAL_MEM_RELEASE_FAIL    = -4201,
    LLM_SHARE_MEM_RELEASE_FAIL     = -4202,
    LLM_ION_MEM_RELEASE_FAIL       = -4203,
    LLM_DIRECT_MEM_RELEASE_FAIL    = -4204,
    LLM_QNN_RELEASE_FAIL           = -4010,
    LLM_NEURON_RELEASE_FAIL        = -4020,
    LLM_MODEL_PTR_EMPTY            = -4001,
    LLM_MODEL_RELEASE_ERR          = -4002,
};

class VCAP_LLM_API LLM_inference_manager {
public:
    LLM_inference_manager();

    ~LLM_inference_manager();

    /*
    BlueLM初始化
    params : 配置参数
    return : SUCCESSE 0
    */
    void config(const llm_params& params);

    /*
    BlueLM初始化
    params : 配置参数
    return : SUCCESSE 0
    */
    LLM_CODE init(llm_trace &trace);

    /*
    查询运行状态
    return : 1 表示当前有模型正在运行；0表示当前没有模型在运行
    */
    int llm_inquery();

    /*
    中断当前运行的prompt
    */
    void llm_interrupt();

    /*
    恢复中断时的标志位
    */
    void llm_continue();

    /*
    基座模型初始化
    params : 配置基座模型参数
    return : SUCCESSE 0
    */
    LLM_CODE init_base(const llm_params& params, llm_trace &trace);

    /*
    LoRA 业务初始化
    lora_params : LoRA模型配置参数
    return : SUCCESSE 0
    */
    LLM_CODE start_lora(const LoRA_config& lora_params, llm_trace &trace);

    /*
    LoRA 业务释放
    */
    LLM_CODE release_lora(const LoRA_config& lora_params);

    /*
    BlueLM执行
    prompt : 被BlueLM使用的提示词
    result : BlueLM的返回结果
    return : SUCCESSE 0
    */
    LLM_CODE eval(std::string prompt, std::string& result, bool new_sts, bool bos);

    /*
    BlueLM推理
    prompt : 被BlueLM使用的提示词
    bos : 是否再prompt前插入bos字符
    eval_cb : 获取结果的回调函数
    return : SUCCESSE 0
    */
    LLM_CODE forward(std::string prompt, bool bos, eval_callback eval_cb, void* data, std::string prompt_tail = "");

    //折叠batch 推理
    // prompt_main参数：给prompt主体
    // prompt_sub：给batch条prompt字段
    // answers：返回batch条识别结果
    LLM_CODE forward(std::string prompt_main, std::vector<std::string> prompt_sub, bool bos, std::vector<std::string>& answers);
    /*
    执行VIT 部分图像处理
    Image_Data rgb 图像数据
    return : SUCCESSE 0
    */
    LLM_CODE call_vit(const Image_Data& image_data);

    /*
    执行VIT 分类
    Image_Data rgb 图像数据
    class_index 类别索引
    return : SUCCESSE 0
    */
    LLM_CODE call_vit_class(const Image_Data& image_data, int& class_index);

    /*
    获取VIT 图像编码结果
    vit_result  图像编码数据指针
    size   数据size 
    return : success 1 fail 0 
    */
    int  get_vit_encode_data(void * vit_result, int size);

    /*
    BlueLM释放
    ctx :BlueLM句柄
    */
    LLM_CODE release();

    /*
    切换到基座模型
    */
    LLM_CODE config_default(const char* context_suffix, llm_trace &trace);

    LLM_CODE print_timing();

    LLM_CODE llm_reset();

    LLM_CODE llm_reset(const llm_params& params, llm_trace &trace);

    double input_tokens_per_second();

    double output_tokens_per_second();

    double first_token_cost_time();

    int is_llm_env_meet(int runtime, int model_type);

    void update_llm_trace_data();

private:
    LLM_HANDLE ctx_handle_ = nullptr;
    LLM_params_ptr params_;
    std::vector<int> embds_;
    std::vector<int> last_n_tokens_;
    int n_past_ = 0;
    void* backend_ = nullptr;
};

}  // namespace vla

#endif