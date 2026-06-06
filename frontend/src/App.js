import * as echarts from 'echarts'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  ImagePlus,
  Network,
  RotateCcw,
  Search,
  Sparkles,
  Target,
  Upload,
  X,
} from '@lucide/vue'
import { analyzeQuestion, fetchQuestions, ocrQuestion } from './api'

const STORAGE_KEYS = {
  questions: 'zhicuotupu.questions',
  graph: 'zhicuotupu.graph',
  reviews: 'zhicuotupu.reviews',
}

const SUBJECTS = ['通用', '数学', '英语', '物理', '化学', '生物', '语文']
const TABS = [
  { key: 'capture', label: '拍题', icon: Camera },
  { key: 'graph', label: '图谱', icon: Network },
  { key: 'book', label: '错题', icon: BookOpen },
  { key: 'review', label: '小测', icon: ClipboardCheck },
]

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function clampScore(score) {
  return Math.max(0, Math.min(100, Math.round(score)))
}

function nodeLevel(score) {
  if (score >= 80) return 'danger'
  if (score >= 60) return 'warning'
  return 'normal'
}

function buildGraphFromQuestions(questions, reviews = []) {
  const nodeMap = new Map()
  const linkMap = new Map()
  const reviewDelta = new Map()

  reviews.forEach((review) => {
    const delta = review.correct ? -10 : 8
    ;(review.knowledgePoints || []).forEach((point) => {
      reviewDelta.set(point, (reviewDelta.get(point) || 0) + delta)
    })
  })

  questions.forEach((question) => {
    const chapter = question.chapter || '待确认章节'
    const chapterNode = nodeMap.get(chapter) || {
      id: chapter,
      name: chapter,
      weakness: 45,
      subject: question.subject,
      category: 'chapter',
      questionIds: [],
    }
    chapterNode.questionIds.push(question.id)
    nodeMap.set(chapter, chapterNode)

    ;(question.knowledge_points || []).forEach((point) => {
      const adjustedScore = clampScore((question.weakness_score || 60) + (reviewDelta.get(point) || 0))
      const current = nodeMap.get(point) || {
        id: point,
        name: point,
        weakness: 0,
        subject: question.subject,
        category: 'knowledge',
        questionIds: [],
      }
      current.weakness = Math.max(current.weakness, adjustedScore)
      current.subject = question.subject
      current.questionIds.push(question.id)
      current.level = nodeLevel(current.weakness)
      nodeMap.set(point, current)

      const linkId = `${chapter}-${point}`
      linkMap.set(linkId, { source: chapter, target: point, questionId: question.id })
    })
  })

  return { nodes: Array.from(nodeMap.values()), links: Array.from(linkMap.values()) }
}

function colorForScore(score) {
  if (score >= 80) return '#e5484d'
  if (score >= 60) return '#f59e0b'
  return '#2f80ed'
}

export default {
  setup() {
    const activeTab = ref('capture')
    const questions = ref([])
    const graph = ref({ nodes: [], links: [] })
    const reviews = ref([])
    const selectedQuestion = ref(null)
    const selectedNode = ref(null)
    const chartRef = ref(null)
    const subject = ref('通用')
    const questionText = ref('已知函数 f(x)=x^2-2x，求函数的最小值。')
    const userAnswer = ref('1')
    const imagePreview = ref('')
    const imageStatus = ref('')
    const recognitionSource = ref('')
    const recognitionDetail = ref({
      correctionNotes: '',
      mistakeHint: '',
      rawText: '',
    })
    const isAnalyzing = ref(false)
    const isRecognizing = ref(false)
    const errorMessage = ref('')
    const bookFilterSubject = ref('全部')
    const bookFilterType = ref('全部')
    const bookFilterPoint = ref('全部')
    const bookSearch = ref('')
    const quizAnswers = ref({})
    const quizFeedback = ref({})
    const analysisDetailsOpen = ref(false)
    const selectedNodeOpen = ref(false)

    const weakNodes = computed(() =>
      graph.value.nodes
        .filter((node) => node.category === 'knowledge')
        .sort((a, b) => b.weakness - a.weakness)
    )

    const selectedNodeQuestions = computed(() => {
      if (!selectedNode.value) return []
      const ids = new Set(selectedNode.value.questionIds || [])
      return questions.value.filter((question) => ids.has(question.id))
    })

    const subjectsInBook = computed(() => ['全部', ...new Set(questions.value.map((question) => question.subject))])
    const typesInBook = computed(() => ['全部', ...new Set(questions.value.map((question) => question.error_type))])
    const pointsInBook = computed(() => [
      '全部',
      ...new Set(questions.value.flatMap((question) => question.knowledge_points || [])),
    ])

    const filteredQuestions = computed(() =>
      questions.value.filter((question) => {
        const subjectOk = bookFilterSubject.value === '全部' || question.subject === bookFilterSubject.value
        const typeOk = bookFilterType.value === '全部' || question.error_type === bookFilterType.value
        const pointOk =
          bookFilterPoint.value === '全部' || (question.knowledge_points || []).includes(bookFilterPoint.value)
        const keyword = bookSearch.value.trim().toLowerCase()
        const searchOk =
          !keyword ||
          [question.question_text, question.chapter, question.error_type, ...(question.knowledge_points || [])]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(keyword)
        return subjectOk && typeOk && pointOk && searchOk
      })
    )

    const currentReviewQuestion = computed(() => selectedQuestion.value || questions.value[0] || null)
    const reviewExercises = computed(() => currentReviewQuestion.value?.recommended_exercises || [])
    const masteryPercent = computed(() => {
      if (!reviews.value.length) return 0
      const correctCount = reviews.value.filter((review) => review.correct).length
      return Math.round((correctCount / reviews.value.length) * 100)
    })
    const latestQuestion = computed(() => selectedQuestion.value || questions.value[0] || null)
    const aiStages = computed(() => {
      const question = latestQuestion.value
      const exerciseCount = question?.recommended_exercises?.length || 0
      const recognized = Boolean(recognitionSource.value || imageStatus.value)
      const hasQuestion = Boolean(question)

      return [
        {
          title: '视觉理解',
          detail: recognitionDetail.value.mistakeHint || (recognitionSource.value === 'ocr_fallback' ? 'OCR 兜底识别题干' : '识别题干、作答和批改痕迹'),
          status: isRecognizing.value ? 'running' : recognized ? 'done' : 'idle',
          meta: recognitionSource.value || 'Vision',
        },
        {
          title: '错因诊断',
          detail: hasQuestion ? question.error_type : '蓝心大模型分析错误原因',
          status: isAnalyzing.value ? 'running' : hasQuestion ? 'done' : 'idle',
          meta: 'Chat Completions',
        },
        {
          title: '知识映射',
          detail: hasQuestion ? `${question.chapter} · ${question.knowledge_points?.length || 0} 个知识点` : '映射章节、知识点和薄弱分',
          status: isAnalyzing.value ? 'running' : hasQuestion ? 'done' : 'idle',
          meta: hasQuestion ? `${question.weakness_score} 分` : 'Graph',
        },
        {
          title: '复习生成',
          detail: hasQuestion ? `已生成 ${exerciseCount} 道同类练习` : '生成复习提纲与针对性练习',
          status: isAnalyzing.value ? 'running' : hasQuestion ? 'done' : 'idle',
          meta: 'Review',
        },
      ]
    })

    function persistAll() {
      writeStorage(STORAGE_KEYS.questions, questions.value)
      writeStorage(STORAGE_KEYS.graph, graph.value)
      writeStorage(STORAGE_KEYS.reviews, reviews.value)
    }

    function rebuildGraph() {
      graph.value = buildGraphFromQuestions(questions.value, reviews.value)
      if (!selectedNode.value && weakNodes.value.length) {
        selectedNode.value = weakNodes.value[0]
      }
      nextTick(renderGraph)
    }

    function renderGraph() {
      if (!chartRef.value) return
      const chart = echarts.getInstanceByDom(chartRef.value) || echarts.init(chartRef.value)
      chart.setOption({
        tooltip: {
          formatter: (params) => {
            if (params.dataType !== 'node') return ''
            return `${params.name}<br/>薄弱分：${params.value || 0}`
          },
        },
        series: [
          {
            type: 'graph',
            layout: 'force',
            roam: true,
            label: { show: true, color: '#0f172a', fontSize: 12 },
            force: { repulsion: 210, edgeLength: 110 },
            data: graph.value.nodes.map((node) => ({
              id: node.id,
              name: node.name,
              value: node.weakness,
              symbolSize: node.category === 'chapter' ? 42 : 34 + node.weakness / 2.8,
              itemStyle: { color: node.category === 'chapter' ? '#8b9ab3' : colorForScore(node.weakness) },
            })),
            links: graph.value.links,
            lineStyle: { color: '#c7d2e3', width: 2 },
          },
        ],
      })
      chart.off('click')
      chart.on('click', (params) => {
        if (params.dataType !== 'node') return
        selectedNode.value = graph.value.nodes.find((node) => node.id === params.data.id) || null
        selectedNodeOpen.value = Boolean(selectedNode.value)
        activeTab.value = 'graph'
      })
    }

    async function loadData() {
      const storedQuestions = readStorage(STORAGE_KEYS.questions, [])
      const storedReviews = readStorage(STORAGE_KEYS.reviews, [])

      if (storedQuestions.length) {
        questions.value = storedQuestions
        reviews.value = storedReviews
      } else {
        questions.value = await fetchQuestions()
      }

      graph.value = buildGraphFromQuestions(questions.value, reviews.value)
      selectedQuestion.value = questions.value[0] || null
      selectedNode.value = weakNodes.value[0] || null
      persistAll()
      await nextTick()
      renderGraph()
    }

    async function handleImageChange(event) {
      const file = event.target.files?.[0]
      if (!file) return
      imagePreview.value = URL.createObjectURL(file)
      imageStatus.value = '正在识别图片中的题目...'
      recognitionSource.value = ''
      recognitionDetail.value = { correctionNotes: '', mistakeHint: '', rawText: '' }
      errorMessage.value = ''
      isRecognizing.value = true
      try {
        // 复赛重点标注：前端上传图片，后端优先调用蓝心视觉模型结构化识别题干、作答和批改痕迹。
        const result = await ocrQuestion(file, subject.value)
        questionText.value = result.question_text || result.text || questionText.value
        userAnswer.value = result.user_answer || userAnswer.value
        recognitionSource.value = result.source || 'vision_fallback'
        recognitionDetail.value = {
          correctionNotes: result.correction_notes || '',
          mistakeHint: result.mistake_hint || '',
          rawText: result.raw_text || result.text || '',
        }
        imageStatus.value =
          result.source === 'ocr_fallback'
            ? '已通过 OCR 兜底识别，请确认题干。'
            : '已通过视觉模型理解题目，请确认题干和作答。'
      } catch (error) {
        errorMessage.value = error.message || '图片识别失败，请手动输入题目。'
        imageStatus.value = '图片识别失败，可手动输入题目。'
      } finally {
        isRecognizing.value = false
      }
    }

    async function submitQuestion() {
      if (!questionText.value.trim()) {
        errorMessage.value = '请先输入或识别题目内容。'
        return
      }
      isAnalyzing.value = true
      errorMessage.value = ''
      try {
        // 复赛重点标注：后端在 vivo_ai.py 中代理调用蓝心大模型，返回错因、知识点和练习。
        const result = await analyzeQuestion({
          question_text: questionText.value,
          user_answer: userAnswer.value,
          subject: subject.value,
          correction_notes: recognitionDetail.value.correctionNotes,
          mistake_hint: recognitionDetail.value.mistakeHint,
          raw_recognition_text: recognitionDetail.value.rawText,
        })
        questions.value = [result, ...questions.value.filter((question) => question.id !== result.id)]
        selectedQuestion.value = result
        rebuildGraph()
        persistAll()
        activeTab.value = 'graph'
      } catch (error) {
        errorMessage.value = error.message || 'AI 分析失败，请稍后重试。'
      } finally {
        isAnalyzing.value = false
      }
    }

    function selectQuestion(question) {
      selectedQuestion.value = question
      activeTab.value = 'book'
    }

    function startReviewFromNode(node) {
      selectedNode.value = node
      const related = questions.value.find((question) => (node.questionIds || []).includes(question.id))
      if (related) selectedQuestion.value = related
      selectedNodeOpen.value = false
      activeTab.value = 'review'
    }

    function submitExercise(exercise, correctAnswer) {
      const key = exercise.title
      const userValue = (quizAnswers.value[key] || '').trim()
      const isCorrect =
        userValue && userValue.replace(/\s+/g, '').toLowerCase() === correctAnswer.replace(/\s+/g, '').toLowerCase()
      reviews.value = [
        {
          id: `r-${Date.now()}`,
          questionId: currentReviewQuestion.value?.id,
          exerciseTitle: exercise.title,
          answer: userValue,
          correct: Boolean(isCorrect),
          knowledgePoints: currentReviewQuestion.value?.knowledge_points || [],
          createdAt: new Date().toISOString(),
        },
        ...reviews.value,
      ]
      quizFeedback.value = {
        ...quizFeedback.value,
        [key]: Boolean(isCorrect),
      }
      rebuildGraph()
      persistAll()
    }

    function clearLocalData() {
      questions.value = []
      graph.value = { nodes: [], links: [] }
      reviews.value = []
      selectedQuestion.value = null
      selectedNode.value = null
      Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key))
      loadData()
    }

    watch(activeTab, () => {
      if (activeTab.value === 'graph') nextTick(renderGraph)
    })

    onMounted(loadData)

    return {
      TABS,
      SUBJECTS,
      activeTab,
      bookFilterPoint,
      bookFilterSubject,
      bookFilterType,
      bookSearch,
      chartRef,
      clearLocalData,
      currentReviewQuestion,
      errorMessage,
      filteredQuestions,
      graph,
      handleImageChange,
      aiStages,
      analysisDetailsOpen,
      imagePreview,
      imageStatus,
      isAnalyzing,
      isRecognizing,
      latestQuestion,
      masteryPercent,
      pointsInBook,
      questionText,
      recognitionDetail,
      questions,
      quizAnswers,
      quizFeedback,
      reviewExercises,
      reviews,
      selectQuestion,
      selectedNode,
      selectedNodeOpen,
      selectedNodeQuestions,
      selectedQuestion,
      startReviewFromNode,
      subject,
      subjectsInBook,
      submitExercise,
      submitQuestion,
      typesInBook,
      userAnswer,
      weakNodes,
      nodeLevel,
      ArrowRight,
      BrainCircuit,
      Check,
      ChevronDown,
      ChevronRight,
      CircleAlert,
      ImagePlus,
      RotateCcw,
      Search,
      Sparkles,
      Target,
      Upload,
      X,
    }
  },
  template: `
    <main class="app-canvas">
      <section class="app-shell">
        <header class="top-bar">
          <div>
            <p class="eyebrow">AI 学习助手</p>
            <h1>知错图谱</h1>
          </div>
          <div class="top-stats">
            <button @click="activeTab = 'book'"><strong>{{ questions.length }}</strong><span>错题</span></button>
            <button @click="activeTab = 'graph'"><strong>{{ weakNodes.length }}</strong><span>薄弱点</span></button>
          </div>
        </header>

        <section v-if="activeTab === 'capture'" class="screen capture-screen">
          <div class="capture-column">
            <section class="welcome-band">
              <div>
                <span class="soft-label"><Sparkles :size="14" /> 今日学习</span>
                <h2>拍下错题，找到真正卡住你的地方</h2>
                <p>识别题目与作答，生成专属复习路径。</p>
              </div>
              <BrainCircuit :size="50" />
            </section>

            <div class="subject-segments" aria-label="选择学科">
              <button v-for="item in SUBJECTS" :key="item" :class="{ active: subject === item }" @click="subject = item">
                {{ item }}
              </button>
            </div>

            <label class="capture-zone">
              <input type="file" accept="image/*" @change="handleImageChange" />
              <div class="capture-icon"><Camera v-if="!isRecognizing" :size="30" /><Sparkles v-else :size="30" /></div>
              <strong>{{ isRecognizing ? '正在理解题目...' : '拍照或上传错题' }}</strong>
              <span>{{ imageStatus || '支持题干、作答与批改痕迹识别' }}</span>
              <div class="capture-actions"><span><Camera :size="16" /> 拍照</span><span><Upload :size="16" /> 相册</span></div>
            </label>

            <img v-if="imagePreview" class="preview-image" :src="imagePreview" alt="题目预览" />

            <section class="surface edit-surface">
              <div class="section-heading">
                <div><span>识别确认</span><h2>确认题目与作答</h2></div>
                <span class="step-badge">分析前可修改</span>
              </div>
              <label class="field-label">题目内容<textarea v-model="questionText" rows="5"></textarea></label>
              <label class="field-label">我的作答<input v-model="userAnswer" placeholder="填写自己的作答" /></label>
              <div v-if="recognitionDetail.mistakeHint || recognitionDetail.correctionNotes" class="recognition-summary">
                <div v-if="recognitionDetail.mistakeHint"><span>初步错因</span><p>{{ recognitionDetail.mistakeHint }}</p></div>
                <div v-if="recognitionDetail.correctionNotes"><span>批改痕迹</span><p>{{ recognitionDetail.correctionNotes }}</p></div>
              </div>
              <button class="primary-action" :disabled="isAnalyzing || isRecognizing" @click="submitQuestion">
                <Sparkles :size="18" /> {{ isAnalyzing ? '蓝心正在分析...' : '开始 AI 分析' }} <ArrowRight :size="18" />
              </button>
              <p v-if="errorMessage" class="error-message"><CircleAlert :size="17" /> {{ errorMessage }}</p>
            </section>
          </div>

          <aside class="result-column">
            <section v-if="selectedQuestion" class="surface insight-card">
              <div class="section-heading">
                <div><span>最新分析</span><h2>{{ selectedQuestion.error_type }}</h2></div>
                <div class="score-ring" :style="{ '--score': selectedQuestion.weakness_score }"><strong>{{ selectedQuestion.weakness_score }}</strong><span>薄弱分</span></div>
              </div>
              <div class="tag-row"><span>{{ selectedQuestion.subject }}</span><span>{{ selectedQuestion.chapter }}</span><span v-for="point in selectedQuestion.knowledge_points" :key="point">{{ point }}</span></div>
              <div class="insight-block coral"><span>错误原因</span><p>{{ selectedQuestion.error_reason }}</p></div>
              <div class="insight-block mint"><span>正确思路</span><p>{{ selectedQuestion.solution }}</p></div>
              <div class="next-action">
                <div><Target :size="20" /><strong>下一步复习</strong></div>
                <button @click="activeTab = 'review'">开始小测 <ChevronRight :size="17" /></button>
              </div>
              <div class="chips"><span v-for="action in selectedQuestion.next_actions" :key="action">{{ action }}</span></div>
            </section>

            <section class="surface analysis-details">
              <button class="details-toggle" @click="analysisDetailsOpen = !analysisDetailsOpen">
                <span><BrainCircuit :size="19" /><span><strong>分析详情</strong><small>查看 AI 能力调用链路</small></span></span>
                <ChevronDown :size="18" :class="{ rotated: analysisDetailsOpen }" />
              </button>
              <div v-if="analysisDetailsOpen" class="stage-list">
                <div v-for="stage in aiStages" :key="stage.title" :class="['stage-item', stage.status]">
                  <div class="stage-dot"></div><div><strong>{{ stage.title }}</strong><p>{{ stage.detail }}</p></div>
                  <span>{{ stage.status === 'running' ? '进行中' : stage.status === 'done' ? '完成' : stage.meta }}</span>
                </div>
              </div>
            </section>
          </aside>
        </section>

        <section v-if="activeTab === 'graph'" class="screen graph-screen">
          <div class="page-intro"><div><span>学习画像</span><h2>知识图谱</h2><p>颜色越暖，越值得优先复习。</p></div><Network :size="32" /></div>
          <section class="surface graph-panel">
            <div class="graph-toolbar">
              <strong>累计薄弱关系</strong>
              <div class="legend"><span class="danger">重点</span><span class="warning">留意</span><span class="normal">稳定</span></div>
            </div>
            <div ref="chartRef" class="graph"></div>
          </section>
          <section class="surface ranking-panel">
            <div class="section-heading"><div><span>优先复习</span><h2>薄弱排行</h2></div><Target :size="22" /></div>
            <button v-for="node in weakNodes" :key="node.id" class="weak-row" @click="selectedNode = node; selectedNodeOpen = true">
              <div class="rank-score" :class="node.level">{{ node.weakness }}</div>
              <div><strong>{{ node.name }}</strong><span>{{ node.subject }} · {{ (node.questionIds || []).length }} 道关联错题</span><div class="progress-track"><i :style="{ width: node.weakness + '%' }"></i></div></div>
              <ChevronRight :size="18" />
            </button>
          </section>
        </section>

        <section v-if="activeTab === 'book'" class="screen book-screen">
          <div class="page-intro"><div><span>持续积累</span><h2>我的错题本</h2><p>{{ filteredQuestions.length }} 道错题等待复盘</p></div><BookOpen :size="32" /></div>
          <section class="surface filter-surface">
            <label class="search-field"><Search :size="18" /><input v-model="bookSearch" placeholder="搜索章节、错因或知识点" /></label>
            <div class="filters">
              <select v-model="bookFilterSubject"><option v-for="item in subjectsInBook" :key="item" :value="item">{{ item }}</option></select>
              <select v-model="bookFilterType"><option v-for="item in typesInBook" :key="item" :value="item">{{ item }}</option></select>
              <select v-model="bookFilterPoint"><option v-for="item in pointsInBook" :key="item" :value="item">{{ item }}</option></select>
              <button class="icon-button" title="重置演示数据" @click="clearLocalData"><RotateCcw :size="18" /></button>
            </div>
          </section>
          <div class="question-grid">
            <article v-for="question in filteredQuestions" :key="question.id" class="surface question-card" @click="selectedQuestion = question">
              <div class="question-card-top">
                <div><span>{{ question.subject }}</span><strong>{{ question.chapter }}</strong></div>
                <div class="weakness-pill" :class="nodeLevel(question.weakness_score)">{{ question.weakness_score }} 分</div>
              </div>
              <div class="tag-row"><span>{{ question.error_type }}</span><span v-for="point in question.knowledge_points" :key="point">{{ point }}</span></div>
              <p>{{ question.error_reason }}</p>
              <details @click.stop>
                <summary>查看讲解 <ChevronDown :size="16" /></summary>
                <p>{{ question.solution }}</p>
                <ol><li v-for="item in question.review_outline" :key="item">{{ item }}</li></ol>
              </details>
            </article>
            <div v-if="!filteredQuestions.length" class="empty-state"><Search :size="30" /><strong>没有找到匹配的错题</strong><span>换个关键词或筛选条件试试</span></div>
          </div>
        </section>

        <section v-if="activeTab === 'review'" class="screen review-screen">
          <div class="page-intro review-intro">
            <div><span>针对性练习</span><h2>复习小测</h2><p v-if="currentReviewQuestion">{{ currentReviewQuestion.mastery_hint }}</p></div>
            <div class="mastery-orb"><strong>{{ masteryPercent }}%</strong><span>掌握率</span></div>
          </div>
          <div v-if="currentReviewQuestion" class="tag-row review-tags"><span>{{ currentReviewQuestion.subject }}</span><span v-for="point in currentReviewQuestion.knowledge_points" :key="point">{{ point }}</span></div>
          <div class="exercise-list">
            <article v-for="(exercise, index) in reviewExercises" :key="exercise.title" class="surface exercise-card">
              <div class="exercise-number">{{ index + 1 }}</div>
              <strong>{{ exercise.title }}</strong>
              <input v-model="quizAnswers[exercise.title]" placeholder="输入你的答案" />
              <button class="secondary-action" @click="submitExercise(exercise, exercise.answer)">提交答案 <ArrowRight :size="17" /></button>
              <div v-if="quizFeedback[exercise.title] !== undefined" :class="['quiz-feedback', quizFeedback[exercise.title] ? 'correct' : 'incorrect']">
                <Check v-if="quizFeedback[exercise.title]" :size="18" /><CircleAlert v-else :size="18" />
                <div><strong>{{ quizFeedback[exercise.title] ? '回答正确' : '还需要巩固' }}</strong><p>参考答案：{{ exercise.answer }}。{{ exercise.explanation }}</p></div>
              </div>
            </article>
          </div>
          <section class="surface review-history">
            <div class="section-heading"><div><span>最近表现</span><h2>小测记录</h2></div><span class="step-badge">{{ reviews.length }} 条</span></div>
            <div class="review-log" v-for="review in reviews.slice(0, 8)" :key="review.id">
              <span :class="review.correct ? 'ok' : 'bad'">{{ review.correct ? '答对' : '巩固' }}</span><p>{{ review.exerciseTitle }}</p>
            </div>
            <p v-if="!reviews.length" class="muted">完成一道练习后，这里会记录你的掌握情况。</p>
          </section>
        </section>

        <div v-if="selectedNodeOpen && selectedNode" class="sheet-backdrop" @click.self="selectedNodeOpen = false">
          <section class="node-sheet">
            <button class="sheet-close" @click="selectedNodeOpen = false"><X :size="20" /></button>
            <div class="rank-score large" :class="selectedNode.level">{{ selectedNode.weakness }}</div>
            <span class="eyebrow">知识点详情</span><h2>{{ selectedNode.name }}</h2>
            <p class="muted">关联错题 {{ selectedNodeQuestions.length }} 道，建议通过针对性练习降低薄弱分。</p>
            <div class="mini-list"><button v-for="question in selectedNodeQuestions" :key="question.id" @click="selectQuestion(question); selectedNodeOpen = false">{{ question.subject }} · {{ question.error_type }}<ChevronRight :size="17" /></button></div>
            <button class="primary-action" @click="startReviewFromNode(selectedNode)">开始针对性小测 <ArrowRight :size="18" /></button>
          </section>
        </div>

        <nav class="bottom-nav">
          <button v-for="tab in TABS" :key="tab.key" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">
            <component :is="tab.icon" :size="21" /><span>{{ tab.label }}</span>
          </button>
        </nav>
      </section>
    </main>
  `,
}
