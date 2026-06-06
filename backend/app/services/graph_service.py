from app.models.schemas import AnalyzeQuestionResponse


def get_knowledge_graph(
    questions: list[AnalyzeQuestionResponse],
) -> dict[str, list[dict[str, object]]]:
    node_scores: dict[str, int] = {}
    links: list[dict[str, object]] = []

    for question in questions:
        chapter = question.chapter
        node_scores[chapter] = max(node_scores.get(chapter, 30), 45)

        for point in question.knowledge_points:
            node_scores[point] = max(node_scores.get(point, 0), question.weakness_score)
            links.append({"source": chapter, "target": point, "questionId": question.id})

    nodes = [
        {
            "id": name,
            "name": name,
            "weakness": score,
            "category": "weak" if score >= 75 else "normal",
        }
        for name, score in node_scores.items()
    ]

    return {"nodes": nodes, "links": links}

