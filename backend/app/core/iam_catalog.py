PERMISSIONS: list[tuple[str, str, str]] = [
    ("packages:read", "View documents", "Documents"),
    ("packages:write", "Create and edit documents", "Documents"),
    ("packages:delete", "Delete documents", "Documents"),
    ("settings:write", "Change column, project, and workflow settings", "Settings"),
    ("metadata:export", "Export metadata and CSV", "Backup"),
    ("metadata:import", "Import metadata and CSV", "Backup"),
    ("notifications:read", "View notifications", "Notifications"),
    ("notifications:write", "Clear notifications", "Notifications"),
    ("iam:read", "View users, roles, and audit events", "Access"),
    ("iam:write", "Manage users and access", "Access"),
]

PERMISSION_CODES = [code for code, _name, _category in PERMISSIONS]

ROLES: dict[str, dict] = {
    "admin": {
        "name": "Administrator",
        "description": "Full access, including user and access management.",
        "permissions": list(PERMISSION_CODES),
    },
    "document_controller": {
        "name": "Document Controller",
        "description": "Manage documents, workflow settings, and backups.",
        "permissions": [
            "packages:read",
            "packages:write",
            "packages:delete",
            "settings:write",
            "metadata:export",
            "metadata:import",
            "notifications:read",
            "notifications:write",
        ],
    },
    "editor": {
        "name": "Editor",
        "description": "Create and update documents without deleting them or changing settings.",
        "permissions": [
            "packages:read",
            "packages:write",
            "metadata:export",
            "notifications:read",
            "notifications:write",
        ],
    },
    "viewer": {
        "name": "Viewer",
        "description": "Read-only access to assigned projects.",
        "permissions": ["packages:read", "notifications:read"],
    },
}

ADMIN_ROLE_SLUG = "admin"
USERNAME_PATTERN = r"^[A-Za-z0-9._-]{3,32}$"
MIN_PASSWORD_LENGTH = 10
