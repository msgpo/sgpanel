"use strict";

const { Gio, GLib, GObject, Gtk, GtkLayerShell, NM } = imports.gi;

const NM80211ApSecurityFlags = NM['80211ApSecurityFlags'];
const NM80211ApFlags = NM['80211ApFlags'];

var NetworkIndicator = class {
    constructor(panelBox, statusLayer, statusStack, statusGrid) {
        this._panelBox = panelBox;
        this._statusLayer = statusLayer;
		this._statusStack = statusStack;
        this._statusGrid = statusGrid;

        NM.Client.new_async(null, this._nmClient.bind(this));
    }

    _nmClient(obj, result) {
        this._client = NM.Client.new_finish(result);
        this._nmDevices = [];
        this._primaryConnection = null;
        this._readDevices();
      
        this._syncNMState();
        this._syncPrimaryConnection();

        this._client.connect("notify::nm-running", this._syncNMState.bind(this));
        this._client.connect("notify::networking-enabled", this._syncNMState.bind(this));
        this._client.connect("notify::state", this._syncNMState.bind(this));
        this._client.connect(
            "notify::primary-connection", this._syncPrimaryConnection.bind(this));
        this._client.connect(
            "notify::activating-connection", this._syncPrimaryConnection.bind(this));
        this._client.connect("device-added", this._addDevice.bind(this));
        this._client.connect("device-removed", this._removeDevice.bind(this));
        this._client.connect("connection-added", this._syncNMState.bind(this));
        this._client.connect("connection-removed", this._syncNMState.bind(this));
    }

    _syncNMState() {
        this._sync();
    }

    _readDevices() {
        let devices = this._client.get_devices();
        devices.forEach((device) => {
            this._addDevice(this._client, device);
        });

    }

    _addDevice(client, device) {
        if (device._delegate) {
            return;
        }
        switch (device.get_device_type()) {
            case NM.DeviceType.WIFI:
                let wirelessDevice =
                    new WirelessDevice(this._client, device, this._panelBox, this._statusLayer, this._statusStack, this._statusGrid);
                device._delegate = wirelessDevice;
            case NM.DeviceType.ETHERNET:
                let wiredDevice = new WiredDevice(this._client, device, this._panelBox, this._statusGrid);
                device._delegate = wiredDevice;
                break;
            default:
                return;
        }
        this._nmDevices.push(device);
    }
 
    _removeDevice(device) {
        let index = this._nmDevices.indexOf(device);
        if (index != -1) {
            this._nmDevices.splice(pos, 1);
        }
        let delegate = device._delegate;
        if (!delegate) {
            // Return if attempting to remove device that was not added initially
            return;
        }
        this._removeDeviceDelete(delegate);
    }

    _removeDeviceDelegate(delegate) {
         delegate.destroy();
    }

    _ensurePrimaryDevice(connection) {
        if (!connection._primaryDevice) {
            let devices = connection.get_devices();
            if (devices.length > 0) {
                let device = devices[0]._delegate;
                connection._primaryDevice = device;
            }
        }
    }

    _getPrimaryConnection() {
        let connection = this._client.get_primary_connection();
        if (connection) {
            this._ensurePrimaryDevice(connection);
            return connection;
        }
        connection = this._client.get_activating_connection();
        if (connection) {
            this._ensurePrimaryDevice(connection);
            return connection;
        }
        return connection;
    }

    _syncPrimaryConnection() {
        this._primaryConnection = this._getPrimaryConnection();
        if (this._primaryConnection) {
            if (this._primaryConnection._primaryDevice) {
                // TODO: Figure out what to do with this
            }
        }
        this._sync();
    }

    _sync() {
        if (!this._client.networking_enabled) {
            return;
        }
        let state = this._client.get_state()
        let device = null;
        if (this._primaryConnection) {
            device = this._primaryConnection._primaryDevice;
        }
        if (device) {
            device.updateIcon();
        }
    }

}

var WirelessDevice = class {
    constructor(client, device, panelBox, statusLayer, statusStack, statusGrid) {
        this._client = client;
        this._device = device;
        this._panelBox = panelBox;
        this._statusLayer = statusLayer;
        this._statusStack = statusStack;
        this._statusGrid = statusGrid;
        
        let connections = this._client.get_connections();
		this._device_connections = this._device.filter_connections(connections);
        this._buildUI();
        this._wirelessEnabledChangedId =
            this._client.connect("notify::wireless-enabled", this._sync.bind(this));
        this._wirelessHwEnabledChangedId =
            this._client.connect("notify::wireless-hardware-enabled", this._sync.bind(this));
        this._stateChangedId = this._device.connect("state-changed", this._stateChanged.bind(this));
        this._sync();
    }

    _buildUI() {
        this._status = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 10,
            homogeneous: false
        });
        this._statusIcon =
            Gtk.Image.new_from_icon_name("network-wireless-signal-none-symbolic", Gtk.IconSize.LARGE_TOOLBAR);
        this._statusButton = new Gtk.Button();
        this._statusButton.set_image(this._statusIcon);
        this._statusButton.set_relief(Gtk.ReliefStyle.NONE);
        let styleContext = this._statusButton.get_style_context();
        styleContext.add_class("status");
        this._statusLabel = new Gtk.Label();
        this._statusButton.set_always_show_image(true);
        this._status.pack_start(this._statusButton, true, true, 0);
        this._status.pack_end(this._statusLabel, true, true, 0);
        this._statusButtonClickedId = this._statusButton.connect("clicked", () => {
        let wirelessMenu =
                new WirelessMenu(this._client, this._device, this._statusLayer, this._statusStack, this._statusGrid, this._device_connections);
        });
        
        this._statusGrid.attach(this._status, 0, 0, 1, 1);
        this._statusGrid.show();
    }
    _canAccessInternet() {
        if (this._client.primary_connection != this._device.active_connection) {
            return true;
        }
        if (this._client.connectivity == NM.ConnectivityState.FULL) {
            return true;
        }
        return false;
    }

    _getIcon() {
        if (this._device.state < NM.DeviceState.PREPARE) {
            return "network-wireless-disconnected-symbolic";
        }
        if (this._device.state < NM.DeviceState.ACTIVATED) {
            return "network-wireless-acquiring-symbolic";
        }
        let accessPoint = this._device.active_access_point;

        if (!accessPoint) {
            if (this._canAccessInternet()) {
                return "network-wireless-connected-symbolic";
            } else {
                return "network-wireless-no-route-symbolic";
            }
        }
        
        let signalStrength = accessPoint.strength;
        if (signalStrength > 80) {
            return "network-wireless-signal-excellent-symbolic";
        }
        if (signalStrength > 55) {
            return "network-wireless-signal-good-symbolic";
        }
        if (signalStrength > 30) {
            return "network-wireless-signal-ok-symbolic";
        }
        if (signalStrength < 5) {
            return "network-wireless-signal-weak-symbolic";
        }
        return "network-wireless-no-route-symbolic"
    }
    
    _getStatus() {
        let accessPoint = this._device.active_access_point;
        if (accessPoint) {
            let ssid = accessPoint.get_ssid();
            let ssidString = NM.utils_ssid_to_utf8(ssid.get_data());
            this._statusIcon.set_from_icon_name(this._getIcon(), Gtk.IconSize.LARGE_TOOLBAR);
            // TODO; truncate/ellipsize the ssidString
            this._statusLabel.set_text( `${ssidString}`);
        }
    }

    _updateStatus(status) {
    }

    _stateChanged(device, newstate, oldstate, reason) {
        if (oldstate == newstate) {
            return;
        }
        
        if (newstate == NM.DeviceState.FAILED &&
                reason != NM.DeviceStateReason.NO_SECRETS) {
            log(`Device state failed: ${reason}`);
        };
        this._sync();
    }

    _sync() {
        this._getStatus();
        let icon = this._getIcon();
        if (!this._icon) {
            this._icon = Gtk.Image.new_from_icon_name(icon, Gtk.IconSize.BUTTON);
            this._panelBox.pack_start(this._icon, false, false, 2);
        } else {
            this._icon.set_from_icon_name(icon, Gtk.IconSize.BUTTON);
        }
        this._icon.show();
    }

    destroy() {
        if (this._statusButtonClickedId) {
            this._statusButton.disconnect(this._statusButtonClickedId);
            this._statusButtonClickedId = 0;
        }
        if (this._stateChangedId) {
            GObject.signal_handler_disconnect(this._device, this._stateChangedId);
            this._stateChangedId = 0;
        }
        if (this._wirelessEnabledChangedId) {
            this._client.disconnect(this._wirelessEnabledChangedId);
            this._wirelessEnabledChangedId = 0;
        }
        if (this._wirelessHwEnabledChangedId) {
            this._client.disconnect(this._wirelessHwEnabledChangedId);
            this._wirelessHwEnabledChangedId = 0;
        }
    }

    updateIcon() {
        this._sync();
    }
}

var WiredDevice = class {
    constructor(client, device, panelBox, statusGrid) {
        this._client = client;
        this._device = device;
        this._panelBox = panelBox;
        this._statusGrid = statusGrid;
        this._icon = null;
        this._buildUI();
        // BUG: These signals get ignored at some point, same as with power.js
        this._stateChangedId = this._device.connect("state-changed", (device, newstate, oldstate, reason) => {
            this._stateChanged(device, newstate, oldstate, reason);
        });
        this._activeConnectionChangedId = this._device.connect("notify::active-connection", this._syncActive.bind(this));
        this._sync();
    }

    _buildUI() {
        this._status = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 10,
            homogeneous: false
        });
        this._statusIcon =
            Gtk.Image.new_from_icon_name("network-wired-disconnected-symbolic", Gtk.IconSize.LARGE_TOOLBAR);
        this._statusGrid.attach(this._status, 0, 1, 1, 1);
    }

    _syncActive(connection) {
        this._sync();
    }

    _canAccessInternet() {
        if (this._client.primary_connection != this._device.active_connection) {
            return true;
        }
        return this._client.connectivity == NM.ConnectivityState.FULL;
    }

    _hasCarrier() {
        if (this._device instanceof NM.DeviceEthernet) {
            return this._device.carrier;
        }
    }

    updateStatus() {

    }
    _getIcon() {
        let active_connection = this._device.active_connection;
        // BUG: The actual device active_connection seems to be null so 
        // this logic is skipped
        if (this._device.active_connection) {
            switch (this._device.active_connection.state) {
                case NM.ActiveConnectionState.ACTIVATING:
                    return "network-wired-acquiring-symbolic";
                case NM.ActiveConnectionState.ACTIVATED:
                    if (this._canAccessInternet()) {
                        return "network-wired-symbolic";
                    } else {
                        return "network-wired-no-route-symbolic";
                    }
                default:
                    return "network-wired-disconnected-symbolic";
            }
        }
        return "network-wired-disconnected-symbolic";
    }

    updateIcon() {
        let icon = this._getIcon();
        if (!this._icon) {
            this._icon = Gtk.Image.new_from_icon_name(icon, Gtk.IconSize.BUTTON);
            this._panelBox.pack_start(this._icon, false, false, 2);
        } else {
            this._icon.set_from_icon_name(icon, Gtk.IconSize.BUTTON);
        }
    }

    _stateChanged(device, newstate, oldstate, reason) {
        if (oldstate == newstate) {
            // No state change
            return;
        }
        
        if (newstate == NM.DeviceState.FAILED &&
                reason != NM.DeviceStateReason.NO_SECRETS) {
                log(`Device state failed: ${reason}`);
        };
        this._sync();
    }

    _sync() {
        this.updateIcon();
        if (this._hasCarrier()) {
            this.updateIcon();
        }
    }
    
    _destroy() {
        if (this._stateChangedId) {
            GObject.signal_handler_disconnect(this._device, this._stateChangedId);
            this._stateChangedId = 0;
        }
    }

}

// TODO: create a generic menu // class to pass into here into of layer/stack/grid stuff -- this will go into
// the status.js as the StatusMenu class
var WirelessMenu = class {
	constructor(client, device, layer, stack, grid, connections) {
		this._client = client;
		this._device = device;
        this._statusLayer = layer;
        this._statusStack = stack;
        this._statusGrid = grid;
        this._connections = connections;
        this._device_connections = connections;
        this._accessPointsStore = new Gtk.ListStore();
        this._accessPointsStore.set_column_types(
            [GObject.TYPE_STRING, GObject.TYPE_STRING, GObject.TYPE_STRING, GObject.TYPE_STRING, GObject.TYPE_OBJECT]);
		
        this._buildUI();
        this._apAddedId = this._device.connect('access-point-added', this._getAccessPoints.bind(this));
        this._apRemovedId = this._device.connect('access-point-removed', this._removeAccessPoint.bind(this));
 		this._scanTimeoutId =
            GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 15, this._onScanTimeout.bind(this));
        this._onScanTimeout();
		this._getAccessPoints();
	}

	_buildUI() {
        // TODO: Add tooltips to things like the encryption icons
        let box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL
        });
        let actionBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL
        });
                                                                                  
        let action_button = Gtk.Button.new_from_icon_name("go-previous-symbolic", Gtk.IconSize.MENU);
        let action_label = new Gtk.Label({ label: "Wifi Networks"});
        actionBox.add(action_button);
        actionBox.add(action_label);
        box.pack_start(actionBox, false, false, 10);
		this._treeView = new Gtk.TreeView({
			expand: true,
			model: this._accessPointsStore });
        this._treeView.set_headers_visible(false);
		let normal = new Gtk.CellRendererText();
		let pixbuf = new Gtk.CellRendererPixbuf();
		let ssid =  new Gtk.TreeViewColumn ({ title: "SSID" })
		let active = new Gtk.TreeViewColumn ({ title: "Active" })
		let encrypted = new Gtk.TreeViewColumn ({ title: "Encrypted" })
		let strength = new Gtk.TreeViewColumn ({ title: "Strength" })
		ssid.pack_start(normal, true);
		active.pack_start(pixbuf, false);
		encrypted.pack_end(pixbuf, false);
		strength.pack_end(pixbuf, false);
		ssid.add_attribute(normal, "text", 0);
		active.add_attribute(pixbuf, "icon-name", 1);
		encrypted.add_attribute(pixbuf, "icon_name", 2);
		strength.add_attribute(pixbuf, "icon_name", 3);
		this._treeView.insert_column(ssid, 0);
		this._treeView.insert_column(active, 1);
		this._treeView.insert_column(encrypted, 2);
		this._treeView.insert_column(strength, 3);
        this._treeView.connect("row-activated", this._connect.bind(this));
		box.pack_end(this._treeView, false, true, 10);
        action_button.connect("clicked", () => {
            this._statusStack.transition_type = Gtk.StackTransitionType.SLIDE_RIGHT;
            let statusBox = this._statusStack.get_child_by_name("status");
            this._statusStack.set_visible_child(statusBox);
            let wifiBox = this._statusStack.get_child_by_name("wifiNetworks");
            this._statusStack.remove(wifiBox);
            this._treeView.destroy();
            actionBox.destroy();
            box.destroy();
            this._destroy();
        });
        this._statusStack.add_named(box, "wifiNetworks");
        actionBox.show_all();
        box.show_all();
         
            
        this._statusStack.transition_type = Gtk.StackTransitionType.SLIDE_LEFT;
        this._statusStack.set_visible_child(box);
	}

    _destroy() {
        if (this._apAddedId) {
            GObject.signal_handler_disconnect(this._device, this._apAddedId);
            this._apAddedId = 0;
        }
        if (this._apRemovedId) {
            GObject.signal_handler_disconnect(this._device, this._apRemovedId);
            this._apRemovedId = 0;
        }
        if (this._onScanTimeoutId) {
            GLib.source_remove(this._onScanTimeout);
            this._onScanTimeout = 0;
        }
    }
	_getAccessPoints() {
		let accessPoints = this._device.get_access_points();
		accessPoints.forEach(accessPoint => {
            this._addAccessPoint(accessPoint);
		});
	}

     _getApSecurityType(accessPoint) {
         let flags = accessPoint.flags;
         let wpaFlags = accessPoint.wpa_flags;
         let rsnFlags = accessPoint.rsn_flags;
         let type;
         // TODO: constants for type
         if (rsnFlags != NM80211ApSecurityFlags.NONE) {
             if (rsnFlags & NM80211ApSecurityFlags.KEY_MGMT_802_1X)
                 type = 6;
             else if (rsnFlags & NM80211ApSecurityFlags.KEY_MGMT_PSK)
                 type = 4;
         } else if (wpaFlags != NM80211ApSecurityFlags.NONE) {
             if (wpaFlags & NM80211ApSecurityFlags.KEY_MGMT_802_1X)
                 type = 5;
             else if (wpaFlags & NM80211ApSecurityFlags.KEY_MGMT_PSK)
                 type = 3;
         } else {
             if (flags & NM80211ApFlags.PRIVACY) {
                 type = 2;
             } else {
                 type = 1;
             }
         }
                                                                                  
         return type;
     }
   
     _checkConnections(accessPoint) {
         this._device_connections.forEach(connection => {
             if (accessPoint.connection_valid(connection) &&
                 this._device_connections.includes(connection)) {
                 this._device_connections.push(connection);
             }
         });
     }

    _addAccessPoint(accessPoint) {
		let ssid = accessPoint.get_ssid();

		if (ssid) {
			// TODO; truncate/ellipsize the ssidString
            let ssidString = NM.utils_ssid_to_utf8(ssid.get_data());
			let [valid, iter] = this._accessPointsStore.get_iter_first();
			for (; valid; valid = this._accessPointsStore.iter_next(iter)) {
				let value = this._accessPointsStore.get_value(iter, 0);
				if (value == ssidString) {
					return;
				}
			};
			let strength = this._getSignalStrengthIcon(accessPoint.strength);
			let encrypted = "";
            let active = "";
            let active_connection = this._device.get_active_connection();
            if (active_connection) {
                let active_connection_id = active_connection.get_id();
                if (active_connection_id) {
                    if (active_connection_id == ssidString) {
                        active = "object-select-symbolic";
                    }
                }
            }
			if (this._getApSecurityType(accessPoint) > 1) {
        		encrypted = "network-wireless-encrypted-symbolic";
			}
			this._accessPointsStore.set(
				this._accessPointsStore.append(),
				[0, 1, 2, 3, 4],
				[ssidString, active, encrypted, strength, accessPoint]);
            this._checkConnections(accessPoint);
		}
	}

	_removeAccessPoint(device, accessPoint) {
		let ssid = accessPoint.get_ssid();

		if (ssid) {
			let ssidString = NM.utils_ssid_to_utf8(ssid.get_data());
			this._accessPointsStore.foreach((model, path, iter) => {
				let value = this._accessPointsStore.get_value(iter, 0);
				if (value == ssidString) {
					this._accessPointsStore.remove(iter);
					return;
				}
			});
		}
	}

	_connect() {
		let selection = this._treeView.get_selection();

		let [selected, model, iter] = selection.get_selected();
		if (selected) {
			let ssid = this._accessPointsStore.get_value(iter, 0);
			let accessPoint = this._accessPointsStore.get_value(iter, 4);
			let valid_connections = accessPoint.filter_connections(this._device_connections);
            let statusBox = this._statusStack.get_child_by_name("status");
			if (valid_connections.length > 0) {
				let connection = valid_connections[0];
				this._client.activate_connection_async(connection, this._device, null, null, null);
                this._destroy();
                this._statusStack.set_visible_child(statusBox);
                this._statusLayer.hide();
			} else {
                let connection = new NM.SimpleConnection();
                let connectionSetting = new NM.SettingConnection();
                connectionSetting.uuid = NM.utils_uuid_generate();
                connection.add_setting(connectionSetting);
			    let authDialog = new AuthDialog(this._client, this._device, accessPoint);
                this._destroy();
                this._statusStack.set_visible_child(statusBox);
                this._statusLayer.hide();
			}
		}
	}

	_getSignalStrengthIcon(strength) {
		if (strength > 80) {
			return "network-wireless-signal-excellent-symbolic";
		}
		if (strength > 55) {
			return "network-wireless-signal-good-symbolic";
		}
		if (strength > 30) {
			return "network-wireless-signal-ok-symbolic";
        }
		if (strength > 5) {
			return "network-wireless-signal-weak-symbolic";
		}
		return "network-wireless-signal-none-symbolic";
	}

	_onScanTimeout() {
		this._device.request_scan_async(null, null);
        return GLib.SOURCE_CONTINUE;
	}


}

var AuthDialog = class {
	constructor(client, device, accessPoint) {
		this._client = client;
		this._device = device;
		this._accessPoint = accessPoint;
		this._buildUI();
	}
	
    _buildUI() {
        this._dialog = new Gtk.Dialog({
                defaultHeight: 200,
                defaultWidth: 600,
				modal: true,
		});
		GtkLayerShell.init_for_window(this._dialog);
		GtkLayerShell.set_layer(this._dialog, GtkLayerShell.Layer.TOP);
		GtkLayerShell.auto_exclusive_zone_enable(this._dialog);
		GtkLayerShell.set_anchor(this._dialog, GtkLayerShell.Edge.LEFT, false);
		GtkLayerShell.set_anchor(this._dialog, GtkLayerShell.Edge.RIGHT, false);
		GtkLayerShell.set_anchor(this._dialog, GtkLayerShell.Edge.TOP, false);
		GtkLayerShell.set_anchor(this._dialog, GtkLayerShell.Edge.BOTTOM, false);
		GtkLayerShell.set_keyboard_interactivity(this._dialog, true);
		let box = this._dialog.get_content_area();

		this._ssid = this._accessPoint.get_ssid();
		let ssidString = NM.utils_ssid_to_utf8(this._ssid.get_data());
		 
        this._dialog.add_button("Cancel", Gtk.ResponseType.CANCEL);
        this._dialog.add_button("Submit", Gtk.ResponseType.OK);

        let messageBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL
        });
        let icon = Gtk.Image.new_from_icon_name("network-wireless-encrypted", Gtk.IconSize.DIALOG);
		let label = new Gtk.Label({
			label:  `Authentication required for SSID "${ssidString}"`
		});
        messageBox.pack_start(icon, false, false, 10);
        messageBox.add(label);
		box.pack_start(messageBox, false, false, 10);
        let passwordBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL
        });
		let passwordLabel = new Gtk.Label({
			label: "Password: "
		});
		this._passwordEntry = new Gtk.Entry();
        this._passwordEntry.set_visibility(false);

		passwordBox.pack_start(passwordLabel, false, false, 10);
		passwordBox.pack_end(this._passwordEntry, true, true, 10);
        box.add(passwordBox);
		this._dialog.connect("response", (dialog, response) => {
            if (response == Gtk.ResponseType.OK) {
                this._connect()
            } else {
                this._dialog.destroy();
            }
        });
		
		this._dialog.show_all();
		this._dialog.present();
	}

    // TODO: there is too much happening here, also we should deal with
    // the agent registration logic properly
	_connect() {
		this._dialog.close();
        let password = this._passwordEntry.get_text();
        // TODO: WEP
        if (password) {
            let connection = new NM.SimpleConnection();
            let connectionSetting = new NM.SettingConnection();
            connectionSetting.uuid = NM.utils_uuid_generate();
            connection.add_setting(connectionSetting);
            let wirelessSetting = new NM.SettingWireless();
            wirelessSetting.ssid = this._ssid;
            connection.add_setting(wirelessSetting);
                                                                                  
            let wirelessSecuritySetting = new NM.SettingWirelessSecurity();
            wirelessSecuritySetting.key_mgmt = "wpa-psk";
            wirelessSecuritySetting.key = password;
            connection.add_setting(wirelessSecuritySetting);
            let agent = new NetworkAgent();
            // TODO: Figure out wirelessSecuritySecurity to Glib.Variant
            let secret = { psk: new GLib.Variant('s', password) };
            let secrets  = new GLib.Variant('a{sv}', secret);
            // TODO: We actually want to add the setting plus toggles for
            // things like "autoconnect"
            connection.update_secrets("802-11-wireless-security", secrets);
            agent.register();
            agent.save_secrets(connection, (connection, error) => {
                if (error) {
                    log("Save secrets error: " + error);
                }
            });
            // TODO: Deal with callback/finish for activate_connection?
            this._client.add_and_activate_connection_async(connection, this._device, this._accessPoint.get_path(), null, null);
        }
	}
}

// TODO: look at implementing these methods using libsecret
var NetworkAgent = GObject.registerClass({
    GTypeFlags: GObject.TypeFlags.ABSTRACT,
}, class NetworkAgent extends NM.SecretAgentOld {
    _init() {
        super._init({ identifier: "com.subgraph.sgpanel.NetworkAgent",
                capabilities: NM.SecretAgentCapabilities.NONE,
                auto_register: false,
        });
    }
    register() {
        super.register(null);
    }

    get_secrets(connection, setting, hints, flags, callback, data) {
        super.get_secrets(connection, setting, hints, flags, callback);
    }

    save_secrets(connection, callback, data) {
        super.save_secrets(connection, callback);
    }
});

