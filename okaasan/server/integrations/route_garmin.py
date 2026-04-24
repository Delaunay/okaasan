from fastapi import APIRouter

# https://www.mtpdrive.com/download.html
# to give MTP device a letter

# garmin.py --all --copy --import --analyze --latest

router = APIRouter(prefix="/garmin", tags=["garmin"])
