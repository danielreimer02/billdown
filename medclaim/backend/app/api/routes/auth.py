from fastapi import APIRouter

router = APIRouter()

# TODO: implement JWT auth
# For now just placeholder so app starts

@router.get("/me")
def get_me():
    return {"message": "auth not yet implemented"}
