"use strict";

pkg.initFormat();
pkg.require({ "Gdk": "3.0",
              "Gio": "2.0",
              "GLib": "2.0",
              "GObject": "2.0",
              "Gtk": "3.0",
              "GtkLayerShell": "0.1",
              "Gvc": "1.0",
              "NM": "1.0"});

imports.gi.versions.Gtk = "3.0";
imports.gi.versions.GtkLayerShell = "0.1";

const { Gio, Gdk, GLib, GObject, Gtk, GtkLayerShell, Gvc }  = imports.gi;

const Clock = imports.clock;
const Workspaces = imports.workspaces;
const Status = imports.status.status;

class Panel {
    constructor(app) {
        this._app = app;
        this._window = null;
        this._box = null;
		this._provider = new Gtk.CssProvider();
        // TODO: Package CSS into external file
		this._provider.load_from_data(
			`button {
             	padding: 0 5px;
                background: transparent;
                color: white;
                border-bottom: 3px solid transparent;
            }
            button.focused {
                background: #64727D;
                border-bottom: 3px solid #5294e2;
            }
            button.status {
                padding: 8px;
                background: @theme_selected_bg_color;
                color: white;
                border-radius: 50%;
            }
            window {
                background: #383c4a;
            }
            window.status, stack, treeview, dialog {
                background: #4b5162;
            }
            `);


    }

    _buildUI() {
        let display = Gdk.Display.get_default();
        let monitor = display.get_monitor(0);
        let geometry = monitor.get_geometry();
        // TODO: Handle multiple displays
        this._window = new Gtk.ApplicationWindow({
            application: this._app,
            defaultHeight: 30,
            defaultWidth: geometry.width,
			opacity: 0.80,
            type: Gtk.WindowType.TOPLEVEL,
        });
        
		Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default(), this._provider,
        	Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

	    GtkLayerShell.init_for_window(this._window);
        GtkLayerShell.set_layer(this._window, GtkLayerShell.Layer.OVERLAY);
        GtkLayerShell.auto_exclusive_zone_enable(this._window);
        GtkLayerShell.set_anchor(this._window, GtkLayerShell.Edge.LEFT, true);
        GtkLayerShell.set_anchor(this._window, GtkLayerShell.Edge.RIGHT, true);
        GtkLayerShell.set_anchor(this._window, GtkLayerShell.Edge.TOP, false);
        GtkLayerShell.set_anchor(this._window, GtkLayerShell.Edge.BOTTOM, true);
        GtkLayerShell.set_monitor(this._window, monitor);
        this._box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL
        });
		this._window.add(this._box);

    }

    // TODO: This should come from configuration
    _appApplets() {
        // TODO: Need applets to have a failure condition and then not load them
		let workspacesApplet = new Workspaces.WorkspacesApplet(this._box);
		let statusFrame = new Gtk.Frame();
        let statusBox = new Gtk.Box({
			orientation: Gtk.Orientation.HORIZONTAL
		});
        this._box.pack_end(statusFrame, false, false, 10);
        let eventBox = new Gtk.EventBox();
        eventBox.add_events(Gdk.EventMask.BUTTON_PRESS_MASK |
            Gdk.EventMask.BUTTON_RELEASE_MASK);
        statusFrame.add(eventBox);
        eventBox.add(statusBox);
        let statusApplet = new Status.StatusApplet(this._window, statusBox, eventBox, this._provider);
		let clockApplet = new Clock.ClockApplet(this._box);
	}


    getWidget() {
        this._buildUI();
		this._appApplets();
        return this._window;
    }
}

const application = new Gtk.Application({
    application_id: "com.subgraph.SgPanel",
    flags: Gio.ApplicationFlags.FLAGS_NONE
});

application.connect("activate", app => {
    let activeWindow = app.activeWindow;

    if (!activeWindow) {
        let panelWindow = new Panel(app);
        activeWindow = panelWindow.getWidget();
    }
	activeWindow.show_all();
    activeWindow.present();
});

application.run(null);

