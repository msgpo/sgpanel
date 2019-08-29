"use strict";

const { Gio, GLib, GObject, Gtk } = imports.gi;

var BrightnessIndicator = class {
    constructor(controlsBox) {
        this._controlsBox = controlsBox;
        this._execPath = null;
        this._setExecPath();
        this._buildUI();

        this._onSliderChangedId = this._slider.connect('value-changed', this._onSliderChanged.bind(this));
        this._sync();
        // NOTE: we don't deal with brightness changes outside of app, need to watch the backlight file for
        // changes to do this properly with gsd-backlight-helper since there are no signals to connect to
    }
   
    _buildUI() {
        this._slider = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 5, 85, 5);
        this._slider.set_sensitive(true);
        this._slider.set_draw_value(false);
        this._slider.set_digits(0);
        let brightnessBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL
        });
        let brightnessIcon = Gtk.Image.new_from_icon_name(
            "display-brightness-symbolic", Gtk.IconSize.MENU);
        brightnessBox.pack_start(brightnessIcon, false, false, 10);
        brightnessBox.pack_end(this._slider, true, true, 10);
        this._controlsBox.pack_start(brightnessBox, false, false, 10);
    }

    _setExecPath() {
        let paths = [
            "/usr/lib/gnome-settings-daemon/gsd-backlight-helper",
            "/usr/libexec/gsd-backlight-helper"
        ];
        paths.forEach(path => {
            if (GLib.file_test(path, GLib.FileTest.EXISTS)) {
                this._execPath = path;
                return;
            }
        });
    }

    async _getBrightness() {
        if (!this._execPath) {
            return Promise.reject("gsd-backlight-helper not found");
        }
        let argv = ["/usr/bin/pkexec",
            this._execPath,
            "--get-brightness",
        ]
        try {
            let proc = new Gio.Subprocess({
                argv: argv,
                flags: Gio.SubprocessFlags.STDOUT_PIPE
            });
            proc.init(null);
            let stdout = await new Promise((resolve, reject) => {
                proc.communicate_utf8_async(null, null, (proc, res) => {
                    let ok, stdout, stderr;
                    try {
                        [ok, stdout, stderr] = proc.communicate_utf8_finish(res);
                        if (proc.get_exit_status() == 0) {
                            resolve(stdout);
                        } else {
                            reject(stderr);
                        }
                    } catch (e) {
                        reject(e);
                    }
                    });
                
            });
            return stdout;
        } catch (e) {
            throw(e);
        }
    }

    async _setBrightness(brightness) {
        if (!this._execPath) {
            return Promise.reject("gsd-backlight-helper not found");
        }
        let argv = ["/usr/bin/pkexec",
            this._execPath,
            "--set-brightness",
            `${brightness}`
        ]

        try {
            let proc = new Gio.Subprocess({
                argv: argv,
                flags: Gio.SubprocessFlags.STDOUT_PIPE
            });
            proc.init(null);
            let stdout = await new Promise((resolve, reject) => {
                proc.communicate_utf8_async(null, null, (proc, res) => {
                    let ok, stdout, stderr;
                    try {
                        [ok, stdout, stderr] = proc.communicate_utf8_finish(res);
                        if (proc.get_exit_status() == 0) {
                            resolve(stdout);
                        } else {
                            // NOTE: Exit status 5 seems to correlate to no brightness settings
                            // ie: desktop with monitor
                            reject(stderr);
                        }
                    } catch (e) {
                        reject(e);
                    }
                    });
            });
            return stdout;
        } catch (e) {
            log(e);
        }
    }

    _onSliderChanged(slider) {
        let percent = parseInt(slider.get_value());
        // TODO: Probably remove this lower bounds check
        if (percent < 5) {
            percent = 5;
        }
        GObject.signal_handler_block(this._slider, this._onSliderChangedId);
        this._setBrightness(percent * 10).then(stdout => {
            // TODO: Do something here?
        });
        GObject.signal_handler_unblock(this._slider, this._onSliderChangedId);
    }

    _sync() {
        this._getBrightness().then(response => {
            if (response >= 0) {
                this._slider.set_value(response / 10);
                return;
            }
        },
        reason => {
            if (reason) {
                log(`brightness applet error: ${reason}`);
            }
            this._slider.disconnect(this._onSliderChangedId);
            this._sliderChangedId = 0;
            this._slider.set_sensitive(false);
        });
    }

}

