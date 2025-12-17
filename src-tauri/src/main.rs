#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  // Fix for IBus issues on Linux preventing keyboard input (Events queue growing too big)
  // and force X11 backend to fix Wayland window resizing glitches/ghosting
  #[cfg(target_os = "linux")]
  {
    std::env::set_var("GTK_IM_MODULE", "xim");
    std::env::set_var("GDK_BACKEND", "x11");
  }

  app_lib::run();
}
