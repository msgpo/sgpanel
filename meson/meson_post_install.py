#!/usr/bin/env python3

import os
import pathlib
import subprocess
import shutil

prefix = pathlib.Path(os.environ.get('MESON_INSTALL_PREFIX', '/usr/local'))
datadir = prefix / 'share'

destdir = os.environ.get('DESTDIR', '')

# Stupid hack because Gvc does not install .typelib in the right place
# See: https://gitlab.gnome.org/GNOME/libgnome-volume-control/issues/8
pkglibdir = prefix / 'lib/x86_64-linux-gnu/com.subgraph.sgpanel'
origtypelibpath = pkglibdir / 'Gvc-1.0.typelib'
typelibdir = pkglibdir / 'girepository-1.0'
desttypelibpath = typelibdir / 'Gvc-1.0.typelib'

if not os.path.exists(typelibdir):
    os.mkdir(typelibdir)
shutil.copy(origtypelibpath, desttypelibpath)

# Boilerplate from GTK JS app example
# if not destdir:
    #print('Compiling gsettings schemas...')
    #subprocess.call(['glib-compile-schemas', str(datadir / 'glib-2.0' / 'schemas')])


    #print('Updating icon cache...')
    #subprocess.call(['gtk-update-icon-cache', '-qtf', str(datadir / 'icons' / 'hicolor')])

    #print('Updating desktop database...')
    #subprocess.call(['update-desktop-database', '-q', str(datadir / 'applications')])
