"use strict";

const ByteArray = imports.byteArray;
const { Gio, GLib, Gtk } = imports.gi;

const IPC_COMMAND = 0;
const IPC_GET_WORKSPACES = 1;
const IPC_SUBSCRIBE = 2;
const IPC_GET_OUTPUTS = 3;
const IPC_GET_TREE = 4;
const IPC_GET_MARKS = 5;
const IPC_GET_BAR_CONFIG = 6;
const IPC_GET_VERSION = 7;
const IPC_GET_BINDING_MODES = 8;
const IPC_GET_CONFIG = 9;
const IPC_SEND_TICK = 10;

var IpcClient = class {
    constructor() {
        // TODO: socketPath determination needs a function of its own
        this.socketPath = null;
        let socketPath = GLib.getenv("SWAYSOCK");
        
        if (GLib.file_test(socketPath, GLib.FileTest.EXISTS)) {
            this.socketPath = socketPath;
        } else {
            var path = GLib.get_user_runtime_dir();
            if (path) {
                let dir = Gio.File.new_for_path(path);
                let enumerator = dir.enumerate_children("standard::display-name",
                        Gio.FileQueryInfoFlags.NONE,
                        null);
                if (enumerator) {
                    while (true) {
                        let file = enumerator.next_file(null);
                        if (!file) {
                            break;
                        }
                        let socket = file.get_name().match(/^sway-ipc.+/);
                        if (socket) {
                            this.socketPath = `${path}/${socket}`;
                            break;
                        }
                    }
                }
            }
        }
		let eventConnection = this._socketClient();
		let eventSocket = eventConnection.get_socket();
		let eventFd = eventSocket.get_fd();
        this.event_stream_unix = new Gio.UnixInputStream({ fd: eventFd });
		this.event_stream_reader =
            new Gio.DataInputStream({ base_stream: this.event_stream_unix });
        this.event_stream_writer =
            new Gio.DataOutputStream({ base_stream: eventConnection.get_output_stream() });
 	}
    

    parseHeader(reader) {
        reader.skip(6, null); // magic number
        reader.set_byte_order(1);
        let size = reader.read_int32(null);
        let type = reader.read_int32(null);
        return size;
    }

    _socketClient() {
        let socketAddress = new Gio.UnixSocketAddress({
            abstract: false,
            address_type: Gio.UnixSocketAddressType.PATH,
            path: this.socketPath});
        let sockClient = new Gio.SocketClient();
        let sockConnection = sockClient.connect(socketAddress, null);
        return sockConnection;
    }

    async _readResponse(reader) {
        let body_size = await this.parseHeader(reader);
        let response = await
            ByteArray.toString(reader.read_bytes(body_size, null).toArray());
        return response;
    }

    getWorkspaces() {
        let sockConnection = this._socketClient();
        let output_reader =
            new Gio.DataInputStream({ base_stream: sockConnection.get_input_stream() });
        let output_writer =
            new Gio.DataOutputStream({ base_stream: sockConnection.get_output_stream() });
        let payload =
            Uint8Array.from([105, 51, 45, 105, 112, 99, 0, 0, 0, 0, IPC_GET_WORKSPACES, 0, 0, 0]);
        output_writer.write(payload, null);
        let body_size = this.parseHeader(output_reader);
        let response =
            ByteArray.toString(output_reader.read_bytes(body_size, null).toArray());
		output_reader.close(null);
		output_reader.close(null);
        let responseJson = JSON.parse(response);
        return responseJson;
    }
    
    focusWorkspace(workspace_id) {
        let sockConnection = this._socketClient();
        let reader =
            new Gio.DataInputStream({ base_stream: sockConnection.get_input_stream() });
        let writer =
            new Gio.DataOutputStream({ base_stream: sockConnection.get_output_stream() });
        let payload =
            Uint8Array.from([105, 51, 45, 105, 112, 99, 0, 0, 0, 0, IPC_COMMAND, 0, 0, 0]);
        let command =
            Uint8Array.from(`workspace ${workspace_id}`, c => c.charCodeAt(0));
        let message = new Uint8Array(payload.length + command.length);
        message.set(payload);
        message.set(command, payload.length);
        message[6] = command.length;
        writer.write(message, null);
        let response = this._readResponse(reader);
        // TODO: Check result
    }

	subscribe(option) {
        let payload =
            Uint8Array.from([105, 51, 45, 105, 112, 99, 0, 0, 0, 0, IPC_SUBSCRIBE, 0, 0, 0]);
        let command =
            Uint8Array.from(`[ "${option}" ]`, c => c.charCodeAt(0));
        let message = new Uint8Array(payload.length + command.length);
        message.set(payload);
        message.set(command, payload.length);
        message[6] = command.length;
        this.event_stream_writer.write(message, null);
        let body_size = this.parseHeader(this.event_stream_reader);
        let response =
            ByteArray.toString(this.event_stream_reader.read_bytes(body_size, null).toArray());
		// TODO: Check result
	}
}

var WorkspacesApplet = class {
	constructor(panelBox) {
        this._client = new IpcClient();
		this._workspaces = this._client.getWorkspaces();
		this._panelBox = panelBox;
        this._buildUI();
		this._eventhandler = false;
        this._updateWorkspaces("create");
		this._client.subscribe("workspace");
	}

    _buildUI() {
        this._revealer = new Gtk.Revealer({ reveal_child: true, transition_duration: 100 });
		this._button_box = new Gtk.ButtonBox();
        this._revealer.add(this._button_box);
		this._panelBox.add(this._revealer);
    }

	_styleButton(button, focused) {
		button.get_style_context().remove_class("focused");
		if (focused) {
        	button.get_style_context().add_class("focused");
		}
	}

	_unfocusButtons() {
		let buttons = this._button_box.get_children();
		buttons.forEach(button => this._styleButton(button, false));
	}

	_updateWorkspaces(event, ws) {
        // TODO; Reorder workspaces logic, messed up order can be tested
        // by enabling a disabled display
		if (event == "create") {
			let workspaces = this._client.getWorkspaces();
			workspaces.forEach((workspace, i) => {
				let button = new Gtk.Button ({label: workspace.num.toString()});
				button.connect("clicked", this._onButtonClicked.bind(this));
				this._styleButton(button, workspace.focused);
				this._button_box.add(button);
			});
			this._workspaces = workspaces;
		} else if (event == "focus") {
            let buttons = this._button_box.get_children();
            let workspaces = this._client.getWorkspaces();
            this._unfocusButtons();
            this._revealer.set_reveal_child(false);
            buttons.forEach((button, i) => {
                let workspace =
                    workspaces.filter(workspace => button.get_label() == workspace.name)[0];
                if (!workspace) {
                    button.set_visible(false);
                    this._revealer.set_reveal_child(true);
                }
            });
            // TODO: should be intergrated into the workspaces loop above
            let button =
                buttons.filter(button => button.get_label() == ws.current.num.toString())[0]
            if (button) {
                this._styleButton(button, true);
            }
            this._revealer.set_reveal_child(true);
		} else if (event == "init") {
			this._unfocusButtons();
			let buttons = this._button_box.get_children();
			let exists =
                buttons.filter(button => button.get_label() == ws.current.num.toString())[0];
			if (!exists) {
				let button = new Gtk.Button({
					label: ws.current.num.toString(),
				});
				this._button_box.add(button);
				this._styleButton(button, true);
				this._button_box.reorder_child(button, ws.current.num-1);
				button.show();
			}
		} else if (event == "empty") {
			let buttons = this._button_box.get_children();
			let button =
                buttons.filter(button => button.get_label() == ws.current.num.toString())[0];
			if (button) {
				this._button_box.remove(button);
				this._button_box.show();
			}
		}
		if (!this._eventhandler) {
		  	this._eventhandler = true;
			let source = this._client.event_stream_unix.create_source(null);
			source.set_callback(this.handleEvents.bind(this));
			source.attach(null);
		}
		return true;
	}
	
	_onButtonClicked(widget) {
		let workspace = widget.get_label();
		this._client.focusWorkspace(workspace);
	}
	
	async handleEvents(src, response) {
        let body_size = this._client.parseHeader(this._client.event_stream_reader);
		try {
        	let response = ByteArray.toString(
				this._client.event_stream_reader.read_bytes(body_size, null).toArray());
			let responseJson = JSON.parse(response);
			let change = responseJson.change;
			if (change) {
				this._updateWorkspaces(change, responseJson);
				return GLib.SOURCE_REMOVE;
			}
			return GLib.SOURCE_CONTINUE;
        } catch (e) {
            logError(e, "Failed to read bytes from Sway IPC subscription");
			return GLIB.SOURCE_REMOVE;
        }
	}
}

