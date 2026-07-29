# Dive Conditions Widget

Dive Conditions Widget is a data-driven web application developed with
AI-assisted engineering tools, including OpenAI Codex and Claude Code. It
combines weather, tide, current, daylight, and site-specific data to generate
deterministic diving-condition assessments. AI was used during development for
code generation, debugging, refactoring, and API integration, but the deployed
application does not use an LLM at runtime.

The current version is configured for Whytecliff Park, BC, Canada and provides
forecast guidance for today and the following six days.

## How it works

The backend retrieves and normalizes forecast and marine data. The browser
applies a deterministic scoring model at 15-minute intervals, groups adjacent
samples with the same rating into selectable time windows, and renders the
result on the tide chart.

See [ASSESSMENT_METHOD.md](ASSESSMENT_METHOD.md) for the complete rules,
thresholds, data sources, and known limitations.

## Data sources

- Open-Meteo weather forecast: wind, precipitation, air temperature, sunrise,
  and sunset.
- Open-Meteo marine forecast: sea-surface temperature.
- Canadian Hydrographic Service: tide predictions and current events.

## Local development

Install the dependencies and start the Flask development server:

```bash
python3 -m pip install -r requirements.txt
python3 app.py
```

Open `http://127.0.0.1:5001`.

## Safety

This widget provides forecast guidance only. Always verify conditions on site
and use your own judgment before entering the water.

