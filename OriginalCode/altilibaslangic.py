from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
import time
import json
from datetime import datetime, timedelta
import os
import re
import subprocess

def create_task(task_name, batch_file_path, schedule_time, arguments):
    """Windows'ta yeni bir zamanlanmış görev oluşturur."""
    try:
        subprocess.run(f"schtasks /delete /tn {task_name} /f", check=False, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        command = f'schtasks /create /tn "{task_name}" /tr "\'{batch_file_path}\' {arguments}" /sc once /st {schedule_time} /f'
        subprocess.run(command, check=True, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print(f"Görev '{task_name}' başarıyla oluşturuldu. Çalışma zamanı: {schedule_time}")
    except subprocess.CalledProcessError as e:
        print(f"Görev '{task_name}' oluşturulurken hata oluştu: {e.stderr.decode('cp857', errors='ignore')}")

options = Options()
options.add_argument("-headless")
driver = webdriver.Firefox(options=options)

try:
    driver.get("https://ebayi.tjk.org/program")
    driver.maximize_window()

    WebDriverWait(driver, 10).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, '[data-div-id="Yarislar"] .dropdown-menu'))
    )
    dropdown_items = driver.find_elements(By.TAG_NAME, "a")
    data_keys = [item.get_attribute("data-key") for item in dropdown_items]
    
    process_keys = ['IZMIR', 'ANTALYA', 'ADANA', 'DBAKIR', 'ISTANBUL', 'SANLIURFA', 'BURSA', 'ANKARA', 'ELAZIG', 'KOCAELI']
    all_data = []

    for selected_key in data_keys:
        if selected_key not in process_keys: continue
        print(f"İşleniyor: {selected_key}")
        altili_sayaci = 1

        driver.find_element(By.XPATH, "//div[@data-div-id='Yarislar']").click(); time.sleep(1)
        driver.find_element(By.XPATH, f"//a[@data-key='{selected_key}']").click(); time.sleep(1)
        driver.find_element(By.XPATH, "//a[contains(text(),'Tüm Koşular')]").click()
        
        try:
            WebDriverWait(driver, 20).until(EC.presence_of_element_located((By.XPATH, "//div[@data-div-id='Kosular']//div[@aria-labelledby]")))
        except TimeoutException:
            print(f"HATA: '{selected_key}' için program yüklenemedi."); continue

        race_tabs = driver.find_elements(By.XPATH, "//div[contains(@id, 'program-') and @role='tabpanel']")
        
        # --- YENİ MANTIK: HER KOŞU İÇİN GANYAN RAPORU ZAMANLA ---
        print(f"-> {selected_key} şehrindeki her koşu için Ganyan Raporu görevleri zamanlanıyor...")
        ganyan_rapor_batch = r"C:\Users\Ocal\Desktop\TJK\GanyanRaporcu.bat"
        for tab in race_tabs:
            try:
                kosu_id = tab.get_attribute("id").split('-')[-1]
                kosu_no = int(kosu_id)
                header_div = tab.find_element(By.XPATH, ".//div[starts-with(@class, 'text-white bg-')]")
                time_match = re.search(r'\d{2}:\d{2}', header_div.text)
                if time_match:
                    race_time = datetime.strptime(time_match.group(0), "%H:%M")
                    report_time = race_time - timedelta(minutes=5)
                    report_time_str = report_time.strftime("%H:%M")
                    task_name = f"TJK_GanyanRapor_{selected_key}_Kosu{kosu_no}"
                    arguments = f"{selected_key} {kosu_no}"
                    create_task(task_name, ganyan_rapor_batch, report_time_str, arguments)
            except Exception as e:
                print(f"   - Koşu {kosu_no} için ganyan raporu zamanlanırken hata: {e}")
        # --- BİTİŞ ---

        for index, tab_element in enumerate(race_tabs):
            try:
                info_box = tab_element.find_element(By.XPATH, ".//div[contains(@class, 'bg-yellow')]")
                if "6'LI GANYAN" in info_box.text:
                    tab_id = tab_element.get_attribute("id")
                    kosu_numarasi = tab_id.split('-')[-1]
                    header_element = driver.find_element(By.ID, f"program-tab-{kosu_numarasi}")
                    koşu_adi = header_element.text.replace("Koşu", " Koşu").strip()
                    details_text = tab_element.find_element(By.XPATH, f".//div[starts-with(@class, 'text-white bg-')]").text
                    time_match = re.search(r'\d{2}:\d{2}', details_text)
                    if not time_match: continue
                    
                    saat_str = time_match.group(0)
                    today_date = datetime.now().date()
                    race_time_obj = datetime.strptime(saat_str, "%H:%M").time()
                    race_start_datetime = datetime.combine(today_date, race_time_obj)
                    
                    agf_rapor_batch = r"C:\Users\Ocal\Desktop\TJK\Raporcu.bat"
                    rapor_zamani = race_start_datetime - timedelta(minutes=5)
                    rapor_zamani_str = rapor_zamani.strftime("%H:%M")
                    task_name = f"TJK_AGFRapor_{selected_key}_{altili_sayaci}.Altili" # Görev adını netleştirdim
                    arguments = f"{selected_key} {altili_sayaci}"
                    create_task(task_name, agf_rapor_batch, rapor_zamani_str, arguments)
                    
                    kontrol_saatleri = {}
                    current_check_time = datetime.now().replace(hour=10, minute=0, second=0, microsecond=0)
                    son_10_dakika_zamani = race_start_datetime - timedelta(minutes=10)
                    
                    while current_check_time <= son_10_dakika_zamani:
                        time_key = current_check_time.strftime("%H:%M")
                        kontrol_saatleri[f"Kontrol_{time_key.replace(':', '')}"] = time_key
                        current_check_time += timedelta(minutes=5)
                        
                    current_check_time = son_10_dakika_zamani + timedelta(minutes=1)
                    while current_check_time < race_start_datetime:
                        time_key = current_check_time.strftime("%H:%M")
                        kontrol_saatleri[f"Kontrol_{time_key.replace(':', '')}"] = time_key
                        current_check_time += timedelta(minutes=1)

                    if altili_sayaci == 2:
                        print(f"   -> {altili_sayaci}. Altılı için ek kontrol saatleri ekleniyor...")
                        for i in range(1, 6):
                            next_race_index = index + i
                            if next_race_index < len(race_tabs):
                                try:
                                    next_race_tab = race_tabs[next_race_index]
                                    next_header_div = next_race_tab.find_element(By.XPATH, f".//div[starts-with(@class, 'text-white bg-')]")
                                    next_details_text = next_header_div.text
                                    next_time_match = re.search(r'\d{2}:\d{2}', next_details_text)
                                    if next_time_match:
                                        next_race_time_str = next_time_match.group(0)
                                        next_race_time = datetime.strptime(next_race_time_str, "%H:%M")
                                        kontrol_zamani = next_race_time - timedelta(minutes=7)
                                        kontrol_zamani_str = kontrol_zamani.strftime("%H:%M")
                                        kontrol_key = f"Kontrol_{kontrol_zamani_str.replace(':', '')}"
                                        if kontrol_key not in kontrol_saatleri:
                                            kontrol_saatleri[kontrol_key] = kontrol_zamani_str
                                            print(f"      - {i+1}. Ayak ({next_race_time_str}) için kontrol saati eklendi: {kontrol_zamani_str}")
                                except Exception as e_inner:
                                    print(f"      - Bir sonraki ayak işlenirken hata: {e_inner}")

                    all_data.append({"Bülten": selected_key, "Altılı": f"{altili_sayaci}. Altılı", "Koşu": koşu_adi, "Saat": saat_str, **kontrol_saatleri})
                    altili_sayaci += 1
            except NoSuchElementException:
                continue
            except Exception as e:
                print(f"Bir koşu işlenirken genel bir hata oluştu: {e}")
                continue
    
    folder_name = datetime.now().strftime('%d%m%Y')
    output_path = os.path.join("C:\\Users\\Ocal\\Desktop\\TJK\\", folder_name, "AltiliBaslama.json")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as json_file:
        json.dump(all_data, json_file, ensure_ascii=False, indent=4)
    print(f"\nTüm veriler '{output_path}' dosyasına kaydedildi.")

finally:
    if 'driver' in locals() and driver:
        driver.quit()