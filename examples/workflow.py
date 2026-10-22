"""Фиксированные три шага для заранее известного обычного случая."""
import json
from agent_lab.core import Action, Toolkit, ToolError, load_data


def workflow(task):
    kit = Toolkit(task)
    policies = kit.execute(Action("search_policy", {"query": task["question"]}))
    if len(policies["matches"]) != 1:
        raise ToolError("workflow_requires_one_match")
    kit.execute(Action("get_sla", {"priority": task["priority"]}))
    return kit.execute(Action("prepare_draft", {"policy_id": policies["matches"][0]["id"]}))


if __name__ == "__main__":
    print(json.dumps(workflow(load_data("cases.json")["normal"]["task"]), ensure_ascii=False, indent=2))
