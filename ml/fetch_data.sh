#!/usr/bin/env bash
# Скачивает открытые датасеты для обучения в ml/data (в git не попадают).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p data && cd data

# 1) Lövdal, den Hartigh, Azzopardi (2021). Injury Prediction in Competitive Runners. DataverseNL, doi:10.34894/UWU9PV, CC0 1.0.
#    Первоисточник: https://doi.org/10.34894/UWU9PV (файл day_approach_maskedID_timeseries.csv).
#    Ниже — зеркало на GitHub; при возможности скачайте файл с DataverseNL.
if [ ! -f runners/day_approach_maskedID_timeseries.csv ]; then
  git clone --depth 1 https://github.com/davudumon/dataset-athlete-injury runners
fi

# 2) SoccerMon (Midoglu et al., 2024, Scientific Data, doi:10.1038/s41597-024-03386-x), CC BY 4.0.
#    Первоисточник: https://doi.org/10.1038/s41597-024-03386-x (Zenodo, ~полный набор).
#    Используется обработанная дневная выгрузка команды B из открытого репозитория:
if [ ! -d soccermon ]; then
  git clone --depth 1 https://github.com/zacfrappier/SoccerMon-Injury-Prediction soccermon
fi
echo "Готово: ml/data/runners и ml/data/soccermon"
