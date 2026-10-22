#!/bin/sh
cd "$(dirname "$0")" || exit 1
python3 -m scripts.beginner
printf '\nНажмите Enter для закрытия...'
read -r workshop_done
