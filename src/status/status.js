"use strict";

const { Gdk, GObject, Gtk, GtkLayerShell } = imports.gi;
const Signals = imports.signals;

const Brightness = imports.status.brightness;
const Network = imports.status.network;
const Power = imports.status.power;
const Volume = imports.status.volume;

var StatusApplet = class {
    constructor(applicationWindow, panelBox, eventBox, provider) {
        this._applicationWindow = applicationWindow;
        this._panelBox = panelBox;
        this._provider = provider;
        this._eventBox = eventBox;

        this._buildUI();
        this._addIndicators();
    }
    
    _buildUI() {
        this._statusWindow = new StatusLayer(this._eventBox, this._provider);
        this._scrolledWindow = new Gtk.ScrolledWindow(
            {
                minContentHeight: 400,
                minContentWidth: 300,
            }
        );
        this._statusBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 10,
        });
        this._statusGrid = new Gtk.Grid({
            margin: 20
        });
        this._controlsBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL
        });
        this._statusStack = new Gtk.Stack();
        this._statusStack.transition_duration = 200;
        this._statusStack.set_vhomogeneous(true);
        this._statusBox.pack_start(this._statusGrid, false, false, 10);
        this._statusBox.pack_end(this._controlsBox, false, false, 10);
        this._statusStack.add_named(this._statusBox, "status");
        this._statusBox.show_all();
        this._statusStack.set_visible_child(this._statusBox);
        // TODO: Scrolled window should not cover the stack actions only the child, maybe move it to network.js
        this._scrolledWindow.add(this._statusStack);
        this._scrolledWindow.show();
        this._statusWindow.set_transient_for(this._applicationWindow);
        this._statusWindow.set_attached_to(this._applicationWindow);
        this._statusWindow.add(this._scrolledWindow);
    }

    _addIndicators() {
        this._networkIndicator =
            new Network.NetworkIndicator(this._panelBox, this._statusWindow, this._statusStack, this._statusGrid);
        this._volumeIndicator = 
            new Volume.VolumeIndicator(this._panelBox, this._controlsBox);
        this._powerIndicator = 
            new Power.PowerIndicator(this._panelBox, this._controlsBox);
        this._brightnessIndicator = 
            new Brightness.BrightnessIndicator(this._controlsBox);
    }

}

// TODO; This should allow keyboard interactivity and hide itself when pressing
// escape or clicking outside of the layer... and possibly modal if that is
// not problematic
var StatusLayer = class {
    constructor(eventBox, provider) {
        this._window = null;
		this._provider = provider;
        this._eventBox = eventBox;
        this._eventBox.connect('button-press-event', this._eventBoxClicked.bind(this));

		this._buildUI();
        return this._window;
    }

    _buildUI() {
        if (!this._window) {
            this._window = new Gtk.Window({
                defaultHeight: 400,
                defaultWidth: 300,
                type: Gtk.WindowType.POPUP,
            });
            let styleContext = this._window.get_style_context();
		    styleContext.add_provider(this._provider,
        	    Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            styleContext.add_class("status");
            GtkLayerShell.init_for_window(this._window);
            GtkLayerShell.set_layer(this._window, GtkLayerShell.Layer.OVERLAY);
            GtkLayerShell.auto_exclusive_zone_enable(this._window);
            GtkLayerShell.set_anchor(this._window, GtkLayerShell.Edge.LEFT, false);
            GtkLayerShell.set_anchor(this._window, GtkLayerShell.Edge.RIGHT, true);
            GtkLayerShell.set_anchor(this._window, GtkLayerShell.Edge.TOP, false);
            GtkLayerShell.set_anchor(this._window, GtkLayerShell.Edge.BOTTOM, true);
        }
    }

    _eventBoxClicked(widget, event) {
        if (this._window) {
            if (!this._window.get_visible()) {
                this._window.show_all();
                this._window.present();
            } else {
                this._window.hide();
            }
        }
        return true;
    };
}
