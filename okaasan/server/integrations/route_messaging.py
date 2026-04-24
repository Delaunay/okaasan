"""
This was entirely reimplemented in javascript so it is not necessary anymore.

Keeping the code here in case we add more use cases for telegram.

Future use cases:
- Event / Task reminder
- Sport/activity tracking ?
"""

import asyncio
import os

from fastapi import APIRouter, Request
from telegram import Bot, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CallbackQueryHandler


TOKEN = os.getenv("KIWI_PLANIFIER_BOT")
CHAT_ID = int(os.getenv("KIWI_PLANIFIER_CHAT_ID", -4898009368))
CHECK_CHAR = "\u2705"
UNCHECK_CHAR = "\u2b1c"

router = APIRouter()


async def _send_todo_checklist(bot_token: str, chat_id: int, title: str, todos: list[str]):
    bot = Bot(token=bot_token)
    keyboard = []
    for index, item in enumerate(todos):
        item = item.strip()
        if not item:
            continue
        keyboard.append([
            InlineKeyboardButton(f"{UNCHECK_CHAR} {item}", callback_data=f"toggle__{index}"),
        ])
    reply_markup = InlineKeyboardMarkup(keyboard)
    await bot.send_message(chat_id=chat_id, text=title, reply_markup=reply_markup)


def send_todo_checklist(title, checklist):
    asyncio.run(_send_todo_checklist(TOKEN, CHAT_ID, title, checklist))


async def button_click(update, context):
    query = update.callback_query
    await query.answer()

    if not query.message.reply_markup:
        print(f'no reply_markup for message_id {query.message.message_id} and chat_id {query.message.chat_id}')
        return

    new_keyboard = []
    state = {}

    for i, row in enumerate(query.message.reply_markup.inline_keyboard):
        old_button = row[0]
        btn_text = old_button.text.replace(f'{UNCHECK_CHAR} ', '').replace(f'{CHECK_CHAR} ', '')
        if query.data == f"toggle__{i}":
            checked = not old_button.text.startswith(CHECK_CHAR)
        else:
            checked = old_button.text.startswith(CHECK_CHAR)
        new_text = f"{CHECK_CHAR if checked else UNCHECK_CHAR} {btn_text}"
        new_keyboard.append([InlineKeyboardButton(new_text, callback_data=f"toggle__{i}")])
        state[btn_text] = checked

    await context.bot.edit_message_text(
        chat_id=query.message.chat_id,
        message_id=query.message.message_id,
        text=query.message.text,
        reply_markup=InlineKeyboardMarkup(new_keyboard)
    )


@router.post("/planning/telegram/checklist")
async def send_checklist(request: Request):
    data = await request.json()
    grocery_list = []
    for item in data:
        grocery_list.append(f"{item['name']}: {item['quantity']} {item['unit']}")
    send_todo_checklist("Grocery list", grocery_list)
    return {"message": "Checklist sent"}


def main() -> None:
    app = Application.builder().token(TOKEN).build()
    app.add_handler(CallbackQueryHandler(button_click))

    async def set_commands(app):
        pass

    app.post_init = set_commands
    app.run_polling()


if __name__ == "__main__":
    main()
