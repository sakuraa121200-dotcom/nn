import os
import uuid
from datetime import date
from flask import Flask, jsonify, request
from flask_cors import CORS
from mysql.connector import connect, Error

app = Flask(__name__)

# Set FRONTEND_ORIGIN in your hosting provider to:
# https://rabnur1.github.io
CORS(app, resources={r"/api/*": {"origins": os.getenv(
    "FRONTEND_ORIGIN", "https://rabnur1.github.io"
)}})

def get_db():
    return connect(
        host=os.environ["DB_HOST"],
        port=int(os.getenv("DB_PORT", "3306")),
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        database=os.environ["DB_NAME"],
        connection_timeout=10,
    )

def valid_uuid(value):
    try:
        return str(uuid.UUID(str(value))) == str(value).lower()
    except (ValueError, TypeError, AttributeError):
        return False

def owner_from_request(data=None):
    owner_id = (data or {}).get("owner_id") or request.args.get("owner_id")
    if not valid_uuid(owner_id):
        return None
    return owner_id

def db_error():
    app.logger.exception("Database operation failed")
    return jsonify(error="Database operation failed"), 500

@app.get("/api/health")
def health():
    return jsonify(status="ok")

@app.get("/api/tasks")
def list_tasks():
    owner_id = owner_from_request()
    if not owner_id:
        return jsonify(error="Valid owner_id is required"), 400

    conn = cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            """SELECT local_id, title, completed
               FROM tasks WHERE owner_id = %s ORDER BY id ASC""",
            (owner_id,),
        )
        rows = cursor.fetchall()
        return jsonify([
            {"localId": row["local_id"], "text": row["title"],
             "done": bool(row["completed"])}
            for row in rows
        ])
    except Error:
        return db_error()
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()

@app.post("/api/tasks")
def create_task():
    data = request.get_json(silent=True) or {}
    owner_id = owner_from_request(data)
    local_id = data.get("localId")
    title = data.get("text")

    if not owner_id or not valid_uuid(local_id):
        return jsonify(error="Valid owner_id and localId are required"), 400
    if not isinstance(title, str) or not title.strip() or len(title.strip()) > 120:
        return jsonify(error="Task must be 1–120 characters"), 400
    if not isinstance(data.get("done", False), bool):
        return jsonify(error="done must be true or false"), 400

    conn = cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        # Stable localId makes migration retries idempotent.
        cursor.execute(
            """INSERT INTO tasks (owner_id, local_id, title, completed)
               VALUES (%s, %s, %s, %s)
               ON DUPLICATE KEY UPDATE
                 title = VALUES(title), completed = VALUES(completed)""",
            (owner_id, local_id, title.strip(), data.get("done", False)),
        )
        conn.commit()
        return jsonify(message="Task saved", localId=local_id), 201
    except Error:
        if conn:
            conn.rollback()
        return db_error()
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()

@app.patch("/api/tasks/<local_id>")
def update_task(local_id):
    data = request.get_json(silent=True) or {}
    owner_id = owner_from_request(data)
    if not owner_id or not valid_uuid(local_id):
        return jsonify(error="Valid owner_id and task ID are required"), 400
    if "done" not in data or not isinstance(data["done"], bool):
        return jsonify(error="done must be true or false"), 400

    conn = cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            """UPDATE tasks SET completed = %s
               WHERE owner_id = %s AND local_id = %s""",
            (data["done"], owner_id, local_id),
        )
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify(error="Task not found"), 404
        return jsonify(message="Task updated")
    except Error:
        if conn:
            conn.rollback()
        return db_error()
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()

@app.delete("/api/tasks/<local_id>")
def delete_task(local_id):
    owner_id = owner_from_request()
    if not owner_id or not valid_uuid(local_id):
        return jsonify(error="Valid owner_id and task ID are required"), 400

    conn = cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM tasks WHERE owner_id = %s AND local_id = %s",
            (owner_id, local_id),
        )
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify(error="Task not found"), 404
        return jsonify(message="Task deleted")
    except Error:
        if conn:
            conn.rollback()
        return db_error()
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()

@app.delete("/api/tasks")
def clear_tasks():
    owner_id = owner_from_request()
    if not owner_id:
        return jsonify(error="Valid owner_id is required"), 400

    completed_only = request.args.get("completed") == "true"
    conn = cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        if completed_only:
            cursor.execute(
                "DELETE FROM tasks WHERE owner_id = %s AND completed = TRUE",
                (owner_id,),
            )
        else:
            cursor.execute("DELETE FROM tasks WHERE owner_id = %s", (owner_id,))
        conn.commit()
        return jsonify(message="Tasks cleared", deleted=cursor.rowcount)
    except Error:
        if conn:
            conn.rollback()
        return db_error()
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()

if __name__ == "__main__":
    # Local development only. Use a production WSGI server when deployed.
    app.run(debug=True)
