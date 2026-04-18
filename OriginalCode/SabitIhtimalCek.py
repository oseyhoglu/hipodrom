import sys
import os
import json
from datetime import datetime
import time
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException, StaleElementReferenceException

def scrape_fixed_odds(cities):
    print("Sabit Ganyan Oranları Çekme İşlemi Başlatıldı...")
    options = Options()
    options.add_argument("-headless")
    driver = webdriver.Firefox(options=options)
    driver.implicitly_wait(5) # Element bulma denemeleri için genel bir bekleme süresi

    try:
        url = "https://ebayi.tjk.org/sabit-ihtimalli-bahis"
        driver.get(url)
        
        WebDriverWait(driver, 20).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'div.hippodromes ul li'))
        )
        time.sleep(2)

        base_path = "C:\\Users\\Ocal\\Desktop\\TJK\\"
        folder_name = datetime.now().strftime('%d%m%Y')
        folder_path = os.path.join(base_path, folder_name)

        for city in cities:
            sabit_oranlar = {}
            print(f"--- {city} için oranlar işleniyor ---")
            
            try:
                # 1. ŞEHİR SEÇİMİ
                city_button = WebDriverWait(driver, 10).until(
                    EC.element_to_be_clickable((By.CSS_SELECTOR, f'li[data-sel="header-nav-hip:{city}"]'))
                )
                driver.execute_script("arguments[0].click();", city_button)
                time.sleep(2)

                # 2. O ŞEHRİN TÜM KOŞULARINI LİSTELE
                race_tabs = driver.find_elements(By.CSS_SELECTOR, f'ul[data-sel="header-nav-racehip:{city}"] li')
                race_count = len(race_tabs)
                print(f"{city} şehrinde toplam {race_count} koşu bulundu.")

                # 3. HER BİR KOŞUYA TEK TEK TIKLA VE VERİLERİ AL
                for i in range(race_count):
                    try:
                        # StaleElementReferenceException hatasını önlemek için listeyi her döngüde yeniden bul
                        current_race_tab = driver.find_elements(By.CSS_SELECTOR, f'ul[data-sel="header-nav-racehip:{city}"] li')[i]
                        race_no = current_race_tab.text.strip()
                        print(f"  -> {race_no}. Koşu işleniyor...")
                        
                        driver.execute_script("arguments[0].click();", current_race_tab)
                        
                        # --- ÖNEMLİ DEĞİŞİKLİK BURADA ---
                        # Tıkladıktan sonra ilgili koşu div'inin DOM'da var olmasını bekle
                        # Style kontrolünü kaldırdık, çünkü çok katı bir kural ve hataya neden oluyor.
                        race_container_selector = f'div.race[data-sel="content-race:{city}-{race_no}"]'
                        race_container = WebDriverWait(driver, 10).until(
                            EC.presence_of_element_located((By.CSS_SELECTOR, race_container_selector))
                        )
                        # --- DEĞİŞİKLİK SONU ---

                        horse_items = race_container.find_elements(By.CSS_SELECTOR, 'div.race-horse-item')

                        for horse in horse_items:
                            try:
                                horse_no = horse.find_element(By.CSS_SELECTOR, 'div[data-column="no"] span').text.strip()
                                odds = horse.find_element(By.CSS_SELECTOR, 'div.race-horse-item-bet strong').text.strip()
                                key = f"{race_no}-{horse_no}"
                                sabit_oranlar[key] = odds
                            except (NoSuchElementException, StaleElementReferenceException):
                                continue
                    except (IndexError, TimeoutException) as e_inner:
                        print(f"Koşu {i+1} işlenirken hata oluştu: {e_inner}. Döngü devam ediyor.")
                        continue
                        
                print(f"{city} için toplam {len(sabit_oranlar)} adet atın oranı hafızaya alındı.")

                # 4. JSON DOSYASINI GÜNCELLE
                json_path = os.path.join(folder_path, f"{city}.json")
                if not os.path.exists(json_path):
                    print(f"UYARI: {json_path} bulunamadı. Güncelleme atlanıyor.")
                    continue

                with open(json_path, 'r+', encoding='utf-8') as f:
                    data = json.load(f)
                    
                    for program in data.get('programs', []):
                        race_no_str = ''.join(filter(str.isdigit, program.get('Koşu', '')))
                        for at_bilgisi in program.get('At Bilgileri', []):
                            at_no_str = at_bilgisi.get('At Numarası', '')
                            key = f"{race_no_str}-{at_no_str}"
                            if key in sabit_oranlar:
                                at_bilgisi['sabit_ganyan'] = sabit_oranlar[key]
                    
                    f.seek(0)
                    json.dump(data, f, ensure_ascii=False, indent=4)
                    f.truncate()
                
                print(f"--> {json_path} dosyası 'sabit_ganyan' oranları ile güncellendi.")

            except Exception as e:
                print(f"HATA: {city} şehri işlenirken bir sorun oluştu: {e}")
                continue

    finally:
        if 'driver' in locals() and driver:
            driver.quit()
        print("Sabit Ganyan Oranları Çekme İşlemi Tamamlandı.")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Kullanım: python SabitIhtimalCek.py <Şehir1> <Şehir2> ...")
        sys.exit(1)
    
    sehirler = [city.upper() for city in sys.argv[1:]]
    scrape_fixed_odds(sehirler)