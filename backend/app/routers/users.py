from fastapi import APIRouter

router = APIRouter(prefix="/users", tags=["Users"])

@router.put("/me/demographics")
async def update_demographics():
    return {"message": "User demographics updated"}
