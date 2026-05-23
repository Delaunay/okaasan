import asyncio
from appdirs import user_config_dir

import telegram
import os


BOT_NAME = "planifier"
BOT_USER_NAME = "kiwi_planifier_bot"
BOT_ID = os.getenv("KIWI_PLANIFIER_BOT")
CHAT_ID = -4898009368

CONFIG = user_config_dir(NAME, AUTHOR)
TELEGRAM = os.path.join(CONFIG, "telegram.json")


async def _send_message(bot_id, chat_id, message):
    bot = telegram.Bot(token=bot_id)
    await bot.initialize()
    mx_size = telegram.constants.MessageLimit.MAX_TEXT_LENGTH

    try:
        end = min(mx_size, len(message))
        start = 0

        while msg := message[start:end]:
            await bot.send_message(chat_id=chat_id, text=msg, parse_mode='MarkdownV2')
            start = end
            end = start + min(mx_size, len(message[start:]))
        
    finally:
        await bot.shutdown()


def send_telegram_message(chat_id, message, bot_id=BOT_ID):
    asyncio.run(_send_message(chat_id, message, bot_id=BOT_ID))


def telegram_bot():
    with open(TELEGRAM, 'r') as file:
        info = json.load(file)
    return info['bot_id'], info['chat_id']


def send_message(message):
    send_telegram_message(*telegram_bot(), message)


def update_telegram(bot, chat):
    os.makedirs(CONFIG, exist_ok=True)
    updated = dict()

    if bot:
        updated['bot_id'] = bot

    if chat:
        updated['chat_id'] = chat
 
    try:
        with open(TELEGRAM, 'r') as file:
            info = json.load(file)
    except:
        info = dict()
    
    info.update(updated)

    with open(TELEGRAM, 'w') as file:
        json.dump(info, file)


def run(bot=None, chat=None):
    update_telegram(bot, chat)
    send_message(message)



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

    # save state
    reply_id = query.message.message_id
    update_reply(reply_id, query.message.chat_id, state)

    # update the message with the new keyboard
    await context.bot.edit_message_text(
        chat_id=query.message.chat_id,
        message_id=query.message.message_id,
        text="Click to toggle",
        reply_markup=InlineKeyboardMarkup(new_keyboard)
    )


# POST https://api.telegram.org/bot<YOUR_BOT_TOKEN>/sendMessage
# Content-Type: application/json

# {
#   "chat_id": 123456789,
#   "text": "Here’s your checklist:\n- [ ] Item 1\n- [ ] Item 2\n- [ ] Item 3"
# }

def main() -> None:
    app = Application.builder().token(TOKEN).build()
    app.add_handler(CallbackQueryHandler(button_click))

    async def send_checklist(chat_id: int, message):
        await application.bot.send_message(chat_id=chat_id, text=message)

    # app.add_handler(MessageHandler(~filters.COMMAND, echo))
    # app.add_handler(CommandHandler('only_todo', lambda up, con: set_chat_mode(up, con, 'todo')))
    # app.add_handler(CommandHandler('all', lambda up, con: set_chat_mode(up, con, 'all')))
    # app.add_handler(CommandHandler('start', startBotPrompt))

    # # Set bot commands
    # async def set_commands(app):
    #     await app.bot.set_my_commands([
    #         BotCommand("only_todo", "Set mode to 'todo' messages"),
    #         BotCommand("all", "Set mode to any messages"),
    #         BotCommand("start", "Start the bot"),
    #     ])
    # app.post_init = set_commands

    app.run_polling()

if __name__ == '__main__':
    main()