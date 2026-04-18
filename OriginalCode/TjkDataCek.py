from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
import time
import json
import os
import re
import sys
from datetime import datetime

# --- YENİ FONKSİYON: SABİT GANYANLARI ÇEKMEK İÇİN ---
def get_sabit_ganyan_oranlari(driver, bulten):
    sabit_oranlar = {}
    try:
        # Mevcut sekmeyi sakla ve yeni bir sekme aç
        main_window = driver.current_window_handle
        driver.execute_script("window.open('');")
        new_window = [window for window in driver.window_handles if window != main_window][0]
        driver.switch_to.window(new_window)

        # Sabit ihtimalli bahis sayfasına git
        driver.get("https://ebayi.tjk.org/sabit-ihtimalli-bahis")
        
        # Şehir (hipodrom) butonunu bul ve tıkla
        city_button = WebDriverWait(driver, 15).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, f'li[data-sel="header-nav-hip:{bulten}"]'))
        )
        driver.execute_script("arguments[0].click();", city_button)
        time.sleep(2)

        # O şehre ait tüm koşuları ve atları gez
        race_containers = driver.find_elements(By.CSS_SELECTOR, f'div.race[data-sel*="content-race:{bulten}-"]')
        for race in race_containers:
            race_no = race.get_attribute('data-sel').split('-')[-1]
            horse_items = race.find_elements(By.CSS_SELECTOR, 'div.race-horse-item')
            for horse in horse_items:
                try:
                    horse_no = horse.find_element(By.CSS_SELECTOR, 'div[data-column="no"] span').text.strip()
                    odds = horse.find_element(By.CSS_SELECTOR, 'div.race-horse-item-bet strong').text.strip()
                    key = f"{race_no}-{horse_no}"
                    sabit_oranlar[key] = odds
                except NoSuchElementException:
                    continue
        
        print(f"-> {bulten} için {len(sabit_oranlar)} adet sabit ganyan oranı başarıyla çekildi.")

    except Exception as e:
        print(f"-> HATA: Sabit ganyan oranları çekilirken sorun oluştu: {e}")
    finally:
        # Yeni sekmeyi kapat ve ana sekmeye geri dön
        driver.close()
        driver.switch_to.window(main_window)
        return sabit_oranlar

def parse_agf_line(line):
    if not line or '(' not in line: return None, None
    try:
        agf_value = line.split('(')[0].replace('%', '').strip()
        agf_sira = line.split('(')[1].replace(')', '').strip()
        return agf_value, agf_sira
    except IndexError:
        return line.replace('%', '').strip(), None

if len(sys.argv) != 3:
    print("Hata: Eksik argüman. Kullanım: TjkDataCek.py <BültenAdı> <KontrolSaati>")
    sys.exit(1)

selected_bulten = sys.argv[1]
kontrol_zamani_str = sys.argv[2]

options = Options()
options.add_argument("-headless")
driver = webdriver.Firefox(options=options)

try:
    # --- YENİ: SABİT GANYAN ORANLARINI ÇEK ---
    sabit_ganyanlar = get_sabit_ganyan_oranlari(driver, selected_bulten)
    # --- BİTİŞ ---

    base_path = "C:\\Users\\Ocal\\Desktop\\TJK\\"
    folder_name = datetime.now().strftime('%d%m%Y')
    folder_path = os.path.join(base_path, folder_name)
    output_file_name = f"{selected_bulten}.json"
    output_path = os.path.join(folder_path, output_file_name)
    
    driver.get("https://ebayi.tjk.org/program")
    time.sleep(2)
    
    print(f"İşleniyor: {selected_bulten} (AGF)")
    driver.find_element(By.XPATH, "//div[@data-div-id='Yarislar']").click(); time.sleep(1)
    driver.find_element(By.XPATH, f"//a[@data-key='{selected_bulten}']").click(); time.sleep(1)
    driver.find_element(By.XPATH, "//a[contains(text(),'Tüm Koşular')]").click()
    
    WebDriverWait(driver, 20).until(EC.presence_of_element_located((By.ID, "program-1")))
    print("Koşu programları başarıyla yüklendi.")

    consolidated_data = {}
    if os.path.exists(output_path):
        with open(output_path, 'r', encoding='utf-8') as f:
            consolidated_data = json.load(f)
    
    if not consolidated_data:
        consolidated_data = {"selected_key": selected_bulten, "programs": []}

    race_panels = driver.find_elements(By.XPATH, "//div[contains(@id, 'program-') and @role='tabpanel']")
    is_first_run = len(consolidated_data["programs"]) == 0

    for panel in race_panels:
        try:
            panel_id = panel.get_attribute("id")
            koşu_numarasi_str = panel_id.split("-")[-1]
            koşu_numarasi = int(koşu_numarasi_str)

            header_div = panel.find_element(By.XPATH, ".//div[starts-with(@class, 'text-white bg-')]")
            header_text = header_div.text
            
            time_match = re.search(r'\d{2}:\d{2}', header_text)
            saat = time_match.group(0) if time_match else None
            
            koşu_adi_element = driver.find_element(By.ID, f"program-tab-{koşu_numarasi}")
            koşu_adi = koşu_adi_element.text
            
            if is_first_run:
                consolidated_data["programs"].append({"Koşu": koşu_adi, "Saat": saat, "At Bilgileri": []})
            
            current_race_data = next((p for p in consolidated_data["programs"] if p["Koşu"] == koşu_adi), None)
            if not current_race_data: continue

            rows = panel.find_elements(By.XPATH, f".//tr[@data-run='{koşu_numarasi}']")
            for row in rows:
                at_no = (row.get_attribute("data-horse-no") or "").strip() or None
                if not at_no: continue

                if is_first_run:
                    at_adi = (row.get_attribute("data-horse-name") or "").strip() or None
                    son6_kosu = (row.find_elements(By.TAG_NAME, "td")[10].text or "").strip() or None
                    current_race_data["At Bilgileri"].append({
                        "At Numarası": at_no, "At Adı": at_adi, "Son 6 Koşu": son6_kosu, "okumalar": []
                    })
                
                current_horse_data = next((h for h in current_race_data["At Bilgileri"] if h["At Numarası"] == at_no), None)
                if not current_horse_data: continue

                # --- YENİ: Sabit ganyanı bu okumaya ekle ---
                sabit_ganyan_key = f"{koşu_numarasi_str}-{at_no}"
                sabit_ganyan_degeri = sabit_ganyanlar.get(sabit_ganyan_key, None)
                # --- BİTİŞ ---

                td_elements = row.find_elements(By.TAG_NAME, "td")
                ganyan = (td_elements[14].text or "").strip() or None
                agf_raw_text = td_elements[15].text
                agf_lines = agf_raw_text.split('\n')
                agf1_val, agf1_sira, agf2_val, agf2_sira = None, None, None, None

                if len(agf_lines) >= 2:
                    agf1_val, agf1_sira = parse_agf_line(agf_lines[0])
                    agf2_val, agf2_sira = parse_agf_line(agf_lines[1])
                elif len(agf_lines) == 1 and agf_lines[0]:
                    # Bu mantık sizde daha önce vardı, koruyorum.
                    if koşu_numarasi >= 7:
                        agf2_val, agf2_sira = parse_agf_line(agf_lines[0])
                    else:
                        agf1_val, agf1_sira = parse_agf_line(agf_lines[0])
                
                new_reading = {
                    "zaman": kontrol_zamani_str, 
                    "sabit_ganyan": sabit_ganyan_degeri, # YENİ EKLENEN ALAN
                    "ganyan": ganyan,
                    "agf1": agf1_val, "agsira1": agf1_sira,
                    "agf2": agf2_val, "agsira2": agf2_sira
                }
                current_horse_data["okumalar"].append(new_reading)

        except Exception as e:
            print(f"Koşu işlenirken bir hata oluştu: {e}")
            continue
    
    with open(output_path, "w", encoding="utf-8") as output_file:
        json.dump(consolidated_data, output_file, ensure_ascii=False, indent=4)
    print(f"Veriler '{output_path}' dosyasına güncellenerek kaydedildi.")

finally:
    if 'driver' in locals() and driver:
        driver.quit()