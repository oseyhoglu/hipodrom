import json
import os
import sys
from datetime import datetime
import requests
from PIL import Image, ImageDraw, ImageFont
import glob

# --- KULLANICI AYARLARI ---
TELEGRAM_BOT_TOKEN = "5975936549:AAFnfEFh3INw_wvjVMBgkJTmyRPw-e3XZ4E"
TELEGRAM_CHAT_ID = "" 
# --- AYARLAR SONU ---

def send_telegram_photo(chat_id, photo_path, caption=""):
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendPhoto"
        with open(photo_path, 'rb') as photo_file:
            files = {'photo': photo_file}
            data = {'chat_id': chat_id, 'caption': caption}
            response = requests.post(url, files=files, data=data, timeout=20)
            if response.status_code == 200:
                print(f"Rapor görseli {chat_id} ID'li kullanıcıya başarıyla gönderildi.")
            else:
                print(f"Telegram gönderme hatası: {response.text}")
    except Exception as e:
        print(f"Telegram gönderme hatası: {e}")

def create_ganyan_report_image(grouped_races_data, dosya_yolu):
    ROW_HEIGHT = 40; PADDING = 10; HEADER_HEIGHT = 45; TITLE_HEIGHT = 45; WIDTH = 1000
    COLOR_BG = (255, 255, 255); COLOR_TITLE_BG = (20, 110, 180); COLOR_HEADER_BG = (222, 235, 247)
    COLOR_TEXT = (0, 0, 0); COLOR_LINE = (224, 224, 224); COLOR_GREEN = (0, 128, 0); COLOR_RED = (200, 0, 0)
    
    # --- DÜZELTİLMİŞ YÜKSEKLİK HESAPLAMASI ---
    total_horse_count = sum(len(race['at_analizleri']) for race in grouped_races_data)
    race_title_height = 30 * len(grouped_races_data)
    # Sadece 1 kez çizilecek olan ana başlık yüksekliğini de hesaba kat
    HEIGHT = TITLE_HEIGHT + HEADER_HEIGHT + race_title_height + (total_horse_count * ROW_HEIGHT) + PADDING

    try:
        font_bold = ImageFont.truetype("arialbd.ttf", 15); font_regular = ImageFont.truetype("arial.ttf", 14)
        font_title = ImageFont.truetype("arialbd.ttf", 18); font_race = ImageFont.truetype("arialbd.ttf", 16)
    except IOError:
        font_bold = ImageFont.load_default(); font_regular = ImageFont.load_default()
        font_title = ImageFont.load_default(); font_race = ImageFont.load_default()

    img = Image.new('RGB', (WIDTH, HEIGHT), COLOR_BG); draw = ImageDraw.Draw(img)
    
    draw.rectangle([0, 0, WIDTH, TITLE_HEIGHT], fill=COLOR_TITLE_BG)
    title_text = "SABİT GANYAN DEĞİŞİM RAPORU"
    bbox = draw.textbbox((0, 0), title_text, font=font_title)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((WIDTH - w) / 2, (TITLE_HEIGHT - h) / 2), title_text, font=font_title, fill=(255, 255, 255))
    
    y = TITLE_HEIGHT

    # --- SÜTUN BAŞLIKLARI DÖNGÜNÜN DIŞINA ALINDI (SADECE 1 KEZ ÇİZİLECEK) ---
    draw.rectangle([0, y, WIDTH, y + HEADER_HEIGHT], fill=COLOR_HEADER_BG)
    draw.text((PADDING, y + 12), "At Adı", font=font_bold, fill=COLOR_TEXT)
    draw.text((400, y + 12), "GANYAN (İlk→Son)", font=font_bold, fill=COLOR_TEXT)
    draw.text((650, y + 12), "AGF (İlk→Son)", font=font_bold, fill=COLOR_TEXT)
    y += HEADER_HEIGHT
    
    for race_data in grouped_races_data:
        # Her koşu için sadece koşu başlığını çiz
        draw.rectangle([0, y, WIDTH, y + 30], fill=(240, 240, 240))
        draw.line([(0, y+29), (WIDTH, y+29)], fill=COLOR_LINE)
        draw.text((PADDING, y + 7), f"{race_data['bulten']} - {race_data['kosu_adi']} ({race_data['saat']})", font=font_race, fill=COLOR_TEXT)
        y += 30

        for analiz in race_data['at_analizleri']:
            bg_color = (248, 255, 247) if analiz['at_no'] % 2 != 0 else (255, 255, 255)
            draw.rectangle([0, y, WIDTH, y + ROW_HEIGHT], fill=bg_color)
            
            draw.text((PADDING, y + 11), f"{analiz['at_no']}", font=font_bold, fill=COLOR_TEXT)
            draw.text((PADDING + 40, y + 11), f"{analiz['at_adi']}", font=font_regular, fill=COLOR_TEXT)

            ganyan_ilk = analiz.get('ilk_ganyan', 'N/A'); ganyan_son = analiz.get('son_ganyan', 'N/A')
            ganyan_fark = analiz.get('ganyan_fark', 0.0); ganyan_fark_renk = COLOR_GREEN if ganyan_fark > 0 else COLOR_RED
            ganyan_text = f"{ganyan_ilk} → {ganyan_son}"; ganyan_fark_text = f"({ganyan_fark:+.2f})"
            draw.text((400, y + 4), ganyan_text, font=font_regular, fill=COLOR_TEXT)
            draw.text((410, y + 20), ganyan_fark_text, font=font_regular, fill=ganyan_fark_renk)

            agf_ilk = analiz.get('ilk_agf', 0.0); agf_son = analiz.get('son_agf', 0.0)
            agf_fark = analiz.get('agf_fark', 0.0); agf_fark_renk = COLOR_GREEN if agf_fark > 0 else COLOR_RED
            agf_text = f"{agf_ilk:.2f}% → {agf_son:.2f}%"; agf_fark_text = f"({agf_fark:+.2f}%)"
            draw.text((650, y + 4), agf_text, font=font_regular, fill=COLOR_TEXT)
            draw.text((660, y + 20), agf_fark_text, font=font_regular, fill=agf_fark_renk)

            y += ROW_HEIGHT
            draw.line([0, y, WIDTH, y], fill=COLOR_LINE)
    
    img.save(dosya_yolu); print(f"Ganyan rapor görseli oluşturuldu: {dosya_yolu}")

def main(current_bulten, current_kosu_no):
    base_path = "C:\\Users\\Ocal\\Desktop\\TJK\\"
    today_str = datetime.now().strftime('%d%m%Y')
    folder_path = os.path.join(base_path, today_str)

    json_files = glob.glob(os.path.join(folder_path, "*.json"))
    json_files = [f for f in json_files if not os.path.basename(f).startswith('AltiliBaslama')]

    all_races = []
    for file_path in json_files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                bulten_adi = data.get("selected_key")
                for program in data.get("programs", []):
                    program['bulten'] = bulten_adi
                    all_races.append(program)
        except Exception as e:
            print(f"Dosya okunurken hata: {file_path}, Hata: {e}")
            continue

    all_races.sort(key=lambda x: datetime.strptime(x['Saat'], '%H:%M'))

    now_time = datetime.now().time()
    current_kosu_time_str = f"{now_time.hour:02d}:{now_time.minute:02d}"
    
    future_races = [
        r for r in all_races 
        if datetime.strptime(r['Saat'], '%H:%M').time() >= datetime.strptime(current_kosu_time_str, '%H:%M').time()
    ]
    
    if not future_races:
        print("Raporlanacak gelecek koşu bulunamadı.")
        return

    analyzed_races = []
    for race in future_races:
        race_analysis = { "bulten": race['bulten'], "kosu_adi": race['Koşu'], "saat": race['Saat'], "at_analizleri": [] }
        for at in race.get("At Bilgileri", []):
            okumalar = at.get('okumalar', [])
            if not okumalar: continue

            sabit_ganyan_okumalari = [o for o in okumalar if o.get('sabit_ganyan') and str(o['sabit_ganyan']).replace(',', '.').replace('.', '', 1).isdigit()]
            ilk_ganyan_str = "N/A"; son_ganyan_str = "N/A"; ganyan_fark = 0.0
            if sabit_ganyan_okumalari:
                ilk_ganyan_str = sabit_ganyan_okumalari[0]['sabit_ganyan']
                son_ganyan_str = sabit_ganyan_okumalari[-1]['sabit_ganyan']
                try:
                    ilk_ganyan_float = float(str(ilk_ganyan_str).replace(',', '.'))
                    son_ganyan_float = float(str(son_ganyan_str).replace(',', '.'))
                    ganyan_fark = ilk_ganyan_float - son_ganyan_float
                except (ValueError, TypeError): pass

            agf_key = 'agf1'
            if not any(o.get(agf_key) for o in okumalar): agf_key = 'agf2'
            agf_okumalari = [o for o in okumalar if o.get(agf_key) is not None]
            
            ilk_agf = 0.0; son_agf = 0.0; agf_fark = 0.0
            if agf_okumalari:
                ilk_agf = float(str(agf_okumalari[0][agf_key]).replace(',', '.'))
                son_agf = float(str(agf_okumalari[-1][agf_key]).replace(',', '.'))
                agf_fark = son_agf - ilk_agf
            
            race_analysis["at_analizleri"].append({
                'at_no': int(at['At Numarası']), 'at_adi': at['At Adı'],
                'ilk_ganyan': ilk_ganyan_str, 'son_ganyan': son_ganyan_str, 'ganyan_fark': ganyan_fark,
                'ilk_agf': ilk_agf, 'son_agf': son_agf, 'agf_fark': agf_fark
            })
        
        race_analysis["at_analizleri"].sort(key=lambda x: x['at_no'])
        analyzed_races.append(race_analysis)

    grouped_races = [analyzed_races[i:i + 3] for i in range(0, len(analyzed_races), 3)]

    for i, group in enumerate(grouped_races):
        dosya_adi = f"GanyanRaporu_{current_bulten}_K{current_kosu_no}_part{i+1}.png"
        dosya_yolu = os.path.join(folder_path, dosya_adi)
        create_ganyan_report_image(group, dosya_yolu)
        send_telegram_photo(TELEGRAM_CHAT_ID, dosya_yolu)

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("Kullanım: python GanyanRaporcu.py <BültenAdı> <KoşuNo>")
        sys.exit(1)
    bulten = sys.argv[1].upper()
    kosu_no = sys.argv[2]
    main(bulten, kosu_no)