# Subgraph Panel

`sgpanel` is a panel application for Sway. 

It is a GJS-based GTK app that renders itself on top of a layer surface. Many 
of the features are implemented using the same primitives and libraries as 
GNOME Shell. 

One of the driving motivations for this project is to provide the same network
configuration capabilities as GNOME Shell using the NetworkManager libraries
instead of relying on the AppIndicator support in `nm-applet` and all of the
baggage that entails.

This project is *very alpha* and some things are not completely implemented or
very robust so I advise against using it until it is more mature.

## Building

Assuming all of the necessary libraries are installed, the following commands
can be used to build the panel:
```
$ meson build
$ ninja -C build
$ sudo ninja -C build install 
```

Note that `libgnome-volume-control` is included as a subproject and will be 
built and installed with the above commands.

## Running

For testing, you can just run out of the build or install directory:
```
$ gjs ./build/src/com.subgraph.sgpanel
```

