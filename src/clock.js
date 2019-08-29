"use strict";

const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;

var ClockApplet = class {
    constructor(panelBox) {
        this._panelBox = panelBox;
        this._label = null;
		this._buildUI();
    }

    _buildUI() {
		let now = GLib.DateTime.new_now_local();
        let timeFormat = "%b %d  %I:%M %p";
		this._label = new Gtk.Label({
			label: ""
		});
        
		this._panelBox.pack_end(this._label, false, false, 10);
		this._sync(`<b> ${now.format(timeFormat)} </b>`);

		GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 1, () => {
			let now = GLib.DateTime.new_now_local();
			
			let text = `<b> ${now.format(timeFormat)} </b>`;
			if (text != this._label.get_label()) {
				this._sync(text);
			}
				 
			return GLib.SOURCE_CONTINUE;
		});
    }

    _sync(text) {
		this._label.set_markup(`<b> ${text} </b>`);
		this._label.show();
    }
}

