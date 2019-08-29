project('com.subgraph.sgpanel', 'c',
  version: '1.0.0',
  meson_version: '>= 0.49.0',
)

app_command = 'sgpanel'
app_id = 'com.subgraph.sgpanel'

gnome = import('gnome')

app_configuration = configuration_data()

app_configuration.set('GJS', find_program('gjs').path())
app_configuration.set('PACKAGE_NAME', app_id)
app_configuration.set('PACKAGE_VERSION', meson.project_version())
app_configuration.set('prefix', get_option('prefix'))

prefix = get_option('prefix')

libdir = join_paths(prefix, get_option('libdir'))
datadir = join_paths(prefix, get_option('datadir'))
pkgdatadir = join_paths(datadir, meson.project_name())
pkglibdir = join_paths(libdir, meson.project_name())

app_configuration.set('libdir', join_paths(get_option('prefix'), get_option('libdir')))
app_configuration.set('pkgdatadir', pkgdatadir)
app_configuration.set('pkglibdir', pkglibdir)

# TODO: this doesn't copy the .typelib to pkglibdir + 'girepository-1.0'
libgvc = subproject('libgnome-volume-control',
  default_options: [
    'package_name=' + meson.project_name(),
    'package_version=' + meson.project_version(),
    'pkgdatadir=' + pkgdatadir,
    'pkglibdir=' + pkglibdir, 
    'static=false',
    'introspection=true',
    'alsa=false',
  ]
)

subdir('src')
meson.add_install_script('meson/meson_post_install.py')
