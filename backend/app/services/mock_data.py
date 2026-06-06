from app.models.schemas import AnalyzeQuestionResponse, RecommendedExercise


DEMO_QUESTIONS = [
    AnalyzeQuestionResponse(
        id="q-demo-001",
        subject="数学",
        chapter="函数",
        knowledge_points=["二次函数", "配方法", "函数最值"],
        error_type="概念理解",
        error_reason="把函数取得最小值时的 x 和函数最小值混淆。",
        solution="f(x)=x^2-2x=(x-1)^2-1，所以当 x=1 时函数取得最小值 -1。",
        review_outline=["复习二次函数顶点式", "区分自变量取值和函数值", "用配方法求最值"],
        recommended_exercises=[
            RecommendedExercise(
                title="求 y=x^2+4x+1 的最小值。",
                answer="-3",
                explanation="y=(x+2)^2-3，因此最小值为 -3。",
            ),
            RecommendedExercise(
                title="求 y=x^2-6x+5 的最小值。",
                answer="-4",
                explanation="y=(x-3)^2-4，因此最小值为 -4。",
            ),
            RecommendedExercise(
                title="函数 y=2x^2-8x+1 在哪里取得最小值？",
                answer="x=2",
                explanation="y=2(x-2)^2-7，所以在 x=2 时取得最小值。",
            ),
        ],
        weakness_score=82,
        difficulty="中等",
        mastery_hint="需要重点复习二次函数最值与顶点式的关系。",
        next_actions=["回看顶点式", "完成 3 道最值小测", "整理同类错题"],
    ),
    AnalyzeQuestionResponse(
        id="q-demo-002",
        subject="英语",
        chapter="时态",
        knowledge_points=["一般过去时", "动词过去式", "时间状语"],
        error_type="语法规则",
        error_reason="看到 yesterday 后没有把谓语动词改成过去式。",
        solution="含有 yesterday、last week 等过去时间状语时，句子通常使用一般过去时。",
        review_outline=["复习一般过去时结构", "整理常见不规则动词", "用时间状语判断时态"],
        recommended_exercises=[
            RecommendedExercise(
                title="I ___ to school yesterday. (go)",
                answer="went",
                explanation="yesterday 表示过去，go 的过去式是 went。",
            ),
            RecommendedExercise(
                title="She ___ TV last night. (watch)",
                answer="watched",
                explanation="last night 表示过去，watch 使用过去式 watched。",
            ),
            RecommendedExercise(
                title="They ___ happy two days ago. (be)",
                answer="were",
                explanation="主语是 They，过去时 be 动词用 were。",
            ),
        ],
        weakness_score=66,
        difficulty="基础",
        mastery_hint="时态判断已入门，但需要强化时间状语触发规则。",
        next_actions=["背诵 10 个不规则动词", "做时态判断小测"],
    ),
]

