"use strict";

const ByteArray = imports.byteArray;
const { Gio, GLib, GObject, Gtk, UPowerGlib: UPower } = imports.gi;

var PowerIndicator = class {
    constructor(panelBox, menuBox) {
        this._panelBox = panelBox;
        this._menuBox = menuBox;
        this._client = UPower.Client.new();
        this._device = this._client.get_display_device();
        // BUG: This signal stops firing for some reason, seems related to layers
        this._buildUI();
        this._sync();
        this._notifySignalId = this._device.connect("notify::state", this._onNotify.bind(this));
    }

    _buildUI() {
        this._icon = Gtk.Image.new_from_icon_name(
            "system-shutdown-symbolic", Gtk.IconSize.BUTTON);
        this._statusIcon = Gtk.Image.new_from_icon_name("system-shutdown-symbol", Gtk.IconSize.BUTTON);
        this._panelBox.pack_end(this._icon, false, false, 2);
        this._statusBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL
        });
        
        this._statusLabel = new Gtk.Label({ label: this._getStatus()});
        this._statusBox.pack_start(this._statusLabel, false, false, 10);
        this._menuBox.pack_end(this._statusBox, false, false, 10);
    }


    _getIcon() {
        if (!this._device.is_present) {
            return "system-shutdown-symbolic";
        }
        // BUG: DeviceState seems to only change on the second signal when
        // plugging/unplugging cable
        switch (this._device.state) {
            case UPower.DeviceState.EMPTY:
                return "battery-empty-symbolic";
            case UPower.DeviceState.FULLY_CHARGED:
                // TODO: is this right? if plugged-in always show charging symbol even when full
                return "battery-full-charging-symbolic";
            case UPower.DeviceState.CHARGING:
            case UPower.DeviceState.PENDING_CHARGE:
                if (this._device.percentage > 90) {
                    return "battery-full-charging-symbolic";
                }
                if (this._device.percentage > 60) {
                    return "battery-good-charging-symbolic";
                }
                if (this._device.percentage > 30) {
                    return "battery-medium-charging-symbolic";
                }
                if (this._device.percentage > 10) {
                    return "battery-low-charging-symbolic";
                }
                if (this._device.percentage > 0) {
                    return "battery-caution-charging-symbolic";
                }
            case UPower.DeviceState.DISCHARGING:
            case UPower.DeviceState.PENDING_DISCHARGE:
                if (this._device.percentage > 90) {
                    return "battery-full-charged-symbolic";
                }
                if (this._device.percentage > 60) {
                    return "battery-good-symbolic";
                }
                if (this._device.percentage > 30) {
                    return "battery-medium-symbolic";
                }
                if (this._device.percentage > 10) {
                    return "battery-low-symbolic";
                }
                if (this._device.percentage > 0) {
                    return "battery-caution-symbolic";
                }
            default:
                return "battery-missing-symbolic";
        }
    }

    _updateIcon() {
        let icon = this._getIcon();
        if (icon != "") {
            this._icon.set_from_icon_name(icon, Gtk.IconSize.BUTTON);
        }
        this._icon.show();
    }

    _getStatus() {
        let seconds = 0;
        let time = 0;
        let minutes = 0;
        let hours = 0;
        let percentage = 0;
        switch ( this._device.state) {
            case UPower.DeviceState.EMPTY:
                return "Empty";
            case UPower.DeviceState.FULLY_CHARGED:
                return "Fully Charged";
            case UPower.DeviceState.CHARGING:
                seconds = this._device.time_to_full;
                time = Math.round(seconds / 60);
                if (time == 0) {
                    return "Estimating (charging)...";
                }
                minutes = time % 60;
                hours = Math.floor(time / 60);
                percentage = this._device.percentage;
                return "%d%% - %d\u2236%02d Until Full".format(
                    percentage, hours, minutes);
            case UPower.DeviceState.PENDING_CHARGE:
                return "Not Charging";
            case UPower.DeviceState.DISCHARGING:
                seconds = this._device.time_to_empty;
                time = Math.round(seconds / 60);
                if (time == 0) {
                    return "Estimating (discharging)...";
                }
                minutes = time % 60;
                hours = Math.floor(time / 60);
                percentage = this._device.percentage;
                return "%d%% - %d\u2236%02d remaining".format(
                    percentage, hours, minutes);
            case UPower.DeviceState.PENDING_DISCHARGE:
                return "Estimating (pending discharge)...";
            default:
                return "Estimating..."
        }
    }

    _updateStatus() {
        if (this._statusBox) {
            this._statusIcon.set_from_icon_name(this._getIcon(), Gtk.IconSize.BUTTON);
            this._statusLabel.set_text(this._getStatus());
            this._statusBox.show();
        }
    }

    _onNotify(device, state) {
        try {
            device.refresh_sync(null);
        } catch(e) {
            log(`Could not refresh_sync battery: ${e}`);
        }
        this._sync();
    }

    _sync() {
        this._updateIcon();
        this._updateStatus();
        this._statusIcon.show();
    }

}

