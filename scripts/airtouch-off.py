#!/usr/bin/env python3
"""
airtouch-off.py — Turn off the AirTouch 5 AC unit.
Connects to the AirTouch 5 at 192.168.68.88 and sends a SET_TO_OFF command.
"""

import asyncio
import logging
import sys

logging.basicConfig(level=logging.WARNING)

AIRTOUCH_IP = "192.168.68.88"
AIRTOUCH_CONSOLE_ID = "AT5C202405000322"


async def turn_off_ac():
    from airtouch5py.airtouch5_simple_client import Airtouch5SimpleClient
    from airtouch5py.discovery import AirtouchDevice
    from airtouch5py.packets.ac_control import (
        AcControl,
        SetPowerSetting,
        SetAcMode,
        SetAcFanSpeed,
        SetpointControl,
    )

    device = AirtouchDevice(
        ip=AIRTOUCH_IP,
        console_id=AIRTOUCH_CONSOLE_ID,
        model="AirTouch5",
        system_id="21652462",
        name="AirTouch 5",
    )

    client = Airtouch5SimpleClient(device)
    await client.connect_and_stay_connected()

    # Check current state
    ac_status = client.latest_ac_status
    already_off = all(
        str(ac.ac_power_state).endswith("OFF") for ac in ac_status.values()
    )

    if already_off:
        print("AC is already off — nothing to do.")
        await client.disconnect()
        return

    # Send OFF command to all AC units
    ac_off_commands = [
        AcControl(
            power_setting=SetPowerSetting.SET_TO_OFF,
            ac_number=ac_num,
            ac_mode=SetAcMode.KEEP_AC_MODE,
            ac_fan_speed=SetAcFanSpeed.KEEP_AC_FAN_SPEED,
            setpoint_control=SetpointControl.KEEP_SETPOINT_VALUE,
            setpoint=25.0,
        )
        for ac_num in ac_status.keys()
    ]

    packet = client.data_packet_factory.ac_control(ac_off_commands)
    await client.send_packet(packet)

    # Brief wait for confirmation
    await asyncio.sleep(2)

    # Re-read status
    await client.send_packet(client.data_packet_factory.ac_status_request())
    await asyncio.sleep(1)

    final_status = client.latest_ac_status
    for ac_num, ac in final_status.items():
        print(f"AC{ac_num}: {ac.ac_power_state} (temp: {ac.temperature}°C)")

    await client.disconnect()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(turn_off_ac())
