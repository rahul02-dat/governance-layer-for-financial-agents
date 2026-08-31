package agentguard.authz

import rego.v1

default allow := false

# Example Policy: Deny if fleet is halted
deny_fleet_halted if {
    input.fleet_state == "HALTED"
}

# Example Policy: Deny if agent is revoked
deny_agent_revoked if {
    input.agent_status == "REVOKED"
}

# Example Policy: Check if agent has permission for the action and resource
has_permission if {
    some i
    permission := input.permissions[i]
    permission.action == input.request.action
    permission.resource_type == input.request.resource_type
    
    # Check amount limit if present
    is_amount_allowed(permission)
    
    # Check currency if present
    is_currency_allowed(permission)
    
    # Check account if present
    is_account_allowed(permission)
}

is_amount_allowed(permission) if {
    not permission.max_amount
}
is_amount_allowed(permission) if {
    permission.max_amount >= input.request.amount
}

is_currency_allowed(permission) if {
    not permission.allowed_currencies
}
is_currency_allowed(permission) if {
    count(permission.allowed_currencies) == 0
}
is_currency_allowed(permission) if {
    input.request.currency in permission.allowed_currencies
}

is_account_allowed(permission) if {
    not permission.allowed_accounts
}
is_account_allowed(permission) if {
    count(permission.allowed_accounts) == 0
}
is_account_allowed(permission) if {
    input.request.resource_id in permission.allowed_accounts
}

allow if {
    not deny_fleet_halted
    not deny_agent_revoked
    has_permission
}

decision := {
    "allowed": allow,
    "reason": get_reason,
}

get_reason := "FLEET_HALTED" if { deny_fleet_halted }
else := "AGENT_REVOKED" if { deny_agent_revoked }
else := "PERMISSION_DENIED" if { not has_permission }
else := "ALLOWED" if { allow }
