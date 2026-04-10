#!/usr/bin/env python3

import json
import sys
import time

try:
    from pybooklid import LidSensor, is_sensor_available, read_lid_angle
except Exception as error:  # pragma: no cover
    print(
        json.dumps(
            {
                "angle": None,
                "available": False,
                "source": "pybooklid-import-error",
                "sensorMode": "state",
                "error": str(error),
            }
        ),
        flush=True,
    )
    sys.exit(0)


def emit(payload: dict) -> None:
    print(json.dumps(payload), flush=True)


def run_monitor() -> None:
    last_angle = None
    available = bool(is_sensor_available())
    emit(
        {
            "angle": None,
            "available": available,
            "source": "pybooklid",
            "sensorMode": "angle",
        }
    )

    try:
        with LidSensor() as sensor:
            for angle in sensor.monitor(interval=0.12):
                if angle is None:
                    angle = read_lid_angle()

                if angle is None:
                    continue

                if last_angle is None or abs(angle - last_angle) >= 1:
                    emit(
                        {
                            "angle": round(float(angle), 1),
                            "available": True,
                            "source": "pybooklid",
                            "sensorMode": "angle",
                        }
                    )
                    last_angle = float(angle)
    except Exception as error:
        emit(
            {
                "angle": None,
                "available": available,
                "source": "pybooklid-error",
                "sensorMode": "state",
                "error": str(error),
            }
        )
        time.sleep(1)


if __name__ == "__main__":
    run_monitor()
