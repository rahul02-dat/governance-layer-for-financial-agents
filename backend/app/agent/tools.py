AGENT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "transfer_funds",
            "description": "Initiate a financial transfer between two corporate accounts.",
            "parameters": {
                "type": "object",
                "properties": {
                    "source_account": {
                        "type": "string",
                        "description": "The account ID to debit (e.g. ACC-001)"
                    },
                    "target_account": {
                        "type": "string",
                        "description": "The account ID to credit (e.g. ACC-002)"
                    },
                    "amount": {
                        "type": "number",
                        "description": "The amount to transfer"
                    },
                    "currency": {
                        "type": "string",
                        "description": "The currency of the transfer (e.g. INR)"
                    },
                    "reason": {
                        "type": "string",
                        "description": "The business reason for this transfer"
                    }
                },
                "required": ["source_account", "target_account", "amount", "currency", "reason"]
            }
        }
    }
]
