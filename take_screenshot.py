from playwright.sync_api import sync_playwright
import os

# 获取脚本所在目录
script_dir = os.path.dirname(os.path.abspath(__file__))
chrome_ext_dir = script_dir  # 脚本就在 chrome-extension 目录下

assets_dir = os.path.join(chrome_ext_dir, 'assets')
os.makedirs(assets_dir, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # 截图 popup.html
    popup_path = os.path.join(chrome_ext_dir, 'popup.html').replace('\\', '/')
    page = browser.new_page(viewport={'width': 420, 'height': 600})
    page.goto(f'file://{popup_path}')
    page.wait_for_timeout(1000)

    popup_screenshot = os.path.join(assets_dir, 'popup.png')
    page.screenshot(path=popup_screenshot, full_page=False)
    print(f'Saved: {popup_screenshot}')

    page.close()

    # 截图 panel.html
    panel_path = os.path.join(chrome_ext_dir, 'panel.html').replace('\\', '/')
    page = browser.new_page(viewport={'width': 480, 'height': 700})
    page.goto(f'file://{panel_path}')
    page.wait_for_timeout(1000)

    panel_screenshot = os.path.join(assets_dir, 'panel.png')
    page.screenshot(path=panel_screenshot, full_page=False)
    print(f'Saved: {panel_screenshot}')

    page.close()

    # 截图 logs.html
    logs_path = os.path.join(chrome_ext_dir, 'logs.html').replace('\\', '/')
    page = browser.new_page(viewport={'width': 640, 'height': 720})
    page.goto(f'file://{logs_path}')
    page.wait_for_timeout(1000)

    logs_screenshot = os.path.join(assets_dir, 'logs.png')
    page.screenshot(path=logs_screenshot, full_page=False)
    print(f'Saved: {logs_screenshot}')

    page.close()
    browser.close()

print('Done!')