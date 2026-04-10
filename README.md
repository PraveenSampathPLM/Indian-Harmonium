# Indian Harmonium

A lightweight local harmonium app with:

- a playable keyboard using Web Audio
- Hindustani sargam labels
- live MacBook lid-angle support via `pybooklid`
- macOS clamshell-state fallback via `ioreg`
- manual bellows pumping for smoother phrasing

## Run

```bash
cd "/Users/PraveenSampath/Documents/New project/Indian Harmonium"
. .venv/bin/activate
# only needed once if you recreate the venv
# pip install -r requirements.txt
npm start
```

Then open [http://localhost:4321](http://localhost:4321).

## Controls

- `A W S E D F T G Y H U J K` plays the keyboard
- `Space` pumps the bellows
- Click the drone stops for `Sa`, `Pa`, and high `Sa`

## Lid Sensor Note

This version now attempts true lid-angle readings through `pybooklid`, which can provide live degree values on supported MacBooks. If the angle feed is unavailable or temporarily noisy, the app falls back to `AppleClamshellState` from macOS so the harmonium still works.
