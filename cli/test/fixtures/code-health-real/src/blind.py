def load(text):
    try:
        return int(text)
    except Exception:
        return None
