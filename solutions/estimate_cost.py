"""Эталон практики 2; все цены вымышлены."""
from agent_lab.core import ToolError, load_data


def estimate_cost(item, quantity):
    catalog = load_data("catalog.json")
    if not isinstance(item, str) or item not in catalog:
        raise ToolError("unknown_item")
    if type(quantity) is not int or not 1 <= quantity <= 100:
        raise ToolError("invalid_quantity")
    return {"total_rub": catalog[item] * quantity, "source": "CATALOG-01"}
