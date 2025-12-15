#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  // Fix for IBus issues on Linux preventing keyboard input (Events queue growing too big)
  #[cfg(target_os = "linux")]
  std::env::set_var("GTK_IM_MODULE", "xim");

  app_lib::run();
}
