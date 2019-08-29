"use strict";

const { GObject, Gtk, Gvc } = imports.gi;

var VolumeIndicator = class {
    constructor(panelBox, controlsBox) {
        this._panelBox = panelBox;
        this._controlsBox = controlsBox;
        this._stream = null;
        this._control = null;
        this._getMixerControl();
        this._control.connect("state-changed", this._onControlStateChanged.bind(this));
        this._sync();
    }


    _getMixerControl() {
        if (this._control) {
            return;
        }

        this._control = new Gvc.MixerControl({ name: "Subgraph Panel Volume Control" });
        this._control.open();
    }

    _buildUI() {
		this._icon = Gtk.Image.new_from_icon_name("audio-volume-muted-symbolic", Gtk.IconSize.BUTTON);
		this._panelBox.pack_end(this._icon, false, false, 2);
        this._slider = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0, 100, 1);
        this._slider.set_sensitive(true);
        this._slider.set_draw_value(false);
        this._slider.set_digits(0);
        let volumeBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL
        });
        let volumeIcon = Gtk.Image.new_from_icon_name(
            "audio-volume-high-symbolic", Gtk.IconSize.MENU);
        volumeBox.pack_start(volumeIcon, false, false, 10);
        volumeBox.pack_end(this._slider, true, true, 10);
        this._controlsBox.pack_start(volumeBox, false, false, 10);

    }

    _onSliderChanged(slider) {
        if (!this._stream) {
            return;
        }
        let volume = slider.get_value();
        //GObject.signal_handler_block(this._slider, this._onSliderChangedId);
        if (this._stream.set_volume(volume)) {
            this._stream.push_volume();
        }
        //GObject.signal_handler_unblock(this._slider, this._onSliderChangedId);
    }

    _onControlStateChanged() {
         if (this._control.get_state() == Gvc.MixerControlState.READY) {
			if (this._stream == null) {
                this._initStream();
			    if (this._stream != null) {
				    this._sync();
                }
			}
        }
    }

	_initStream() {
		this._stream = this._control.get_default_sink();
		if (this._stream != null) {
			this._stream.connect("notify::volume", this._sync.bind(this));
			this._stream.connect("notify::is-muted", this._sync.bind(this));
		}
        this._buildUI();
        this._onSliderChangedId = this._slider.connect('value-changed', this._onSliderChanged.bind(this));
	}

	getIcon() {
		let icons = ["audio-volume-muted-symbolic",
			"audio-volume-low-symbolic",
			"audio-volume-medium-symbolic",
			"audio-volume-high-symbolic",
			"audio-volume-overamplified-symbolic"];
		let icon = null;
		if (this._stream.volume <= 0 || this._stream.is_muted) {
			icon = icons[0];
		} else {
			let index = Math.ceil(3 * this._stream.volume / this._control.get_vol_max_norm());
			if (index < 1) {
				icon = icons[1];
			} else if (index > 3) {
				icon = icons[4];
			} else {
				icon = icons[index];
			}
		}
		return icon;
	}

	updateIcon() {
        let icon = this.getIcon();
		if (this._icon != null) {
			this._icon.set_from_icon_name(icon, Gtk.IconSize.BUTTON);
			this._icon.show()
		}
	}

	_sync() {
        if (this._stream) {
            this.updateIcon();
            let volume = this._stream.volume;
            let volume_max = this._control.get_vol_max_amplified();
            let volume_norm = this._control.get_vol_max_norm();
            let step_size = volume_max / 20.0;
            //GObject.signal_handler_block(this._slider, this._onSliderChangedId);
            this._slider.set_range(0, volume_norm);
            if (volume > volume_norm) {
                this._slider.set_value(volume);
            } else {
                this._slider.set_value(volume);
            }
            //GObject.signal_handler_unblock(this._slider, this._onSliderChangedId);
            this._slider.set_increments(step_size, step_size);
        }
	}


}

