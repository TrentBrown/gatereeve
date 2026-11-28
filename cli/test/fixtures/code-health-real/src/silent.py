def quiet(text):
    try:
        return int(text)
    except Exception:
        pass
    return 0
