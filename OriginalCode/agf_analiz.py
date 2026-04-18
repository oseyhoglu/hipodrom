import json
import os
import sys
from datetime import datetime, timedelta
import requests
import re
from PIL import Image, ImageDraw, ImageFont
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

# --- KULLANICI AYARLARI ---
TELEGRAM_BOT_TOKEN = "5975936549:AAFnfEFh3INw_wvjVMBgkJTmyRPw-e3XZ4E"
TELEGRAM_CHAT_ID = ["-4730523355"]
# --- AYARLAR SONU "545683803", -4730523355 ---

def send_telegram_bundle(tablo_yolu):
    if TELEGRAM_BOT_TOKEN == "BURAYA_BOT_TOKENINIZI_YAZIN" or not TELEGRAM_CHAT_ID:
        print("\nUYARI: Telegram BOT TOKEN ve CHAT ID bilgileri girilmemiş. Mesaj gönderilemedi.")
        return

    for chat_id in TELEGRAM_CHAT_ID:
        try:
            url_photo = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendPhoto"
            with open(tablo_yolu, 'rb') as photo_file:
                files = {'photo': photo_file}
                data = {'chat_id': chat_id}
                requests.post(url_photo, files=files, data=data, timeout=20)
            print(f"\nRapor tablosu {chat_id} ID'li kullanıcıya başarıyla gönderildi.")
        except Exception as e:
            print(f"{chat_id} adresine Telegram tablo gönderme hatası: {e}")

def create_report_image(kosu_verisi, bulten_adi, agf_key, at_analizleri, dosya_yolu):
    ROW_HEIGHT = 40 
    PADDING = 10
    HEADER_HEIGHT = 40
    TITLE_HEIGHT = 40
    WIDTH = 1200

    HEIGHT = TITLE_HEIGHT + HEADER_HEIGHT + (len(at_analizleri) * ROW_HEIGHT) + PADDING
    COLOR_BG = (255, 255, 255); COLOR_TITLE_BG = (1, 87, 155); COLOR_HEADER_BG = (229, 245, 228)
    COLOR_TEXT = (0, 0, 0); COLOR_LINE = (224, 224, 224); COLOR_GREEN = (0, 128, 0); COLOR_RED = (200, 0, 0)

    try:
        font_bold = ImageFont.truetype("arialbd.ttf", 15); font_regular = ImageFont.truetype("arial.ttf", 14); font_title = ImageFont.truetype("arialbd.ttf", 18)
    except IOError:
        font_bold = ImageFont.load_default(); font_regular = ImageFont.load_default(); font_title = ImageFont.load_default()

    img = Image.new('RGB', (WIDTH, HEIGHT), COLOR_BG); draw = ImageDraw.Draw(img)
    
    draw.rectangle([0, 0, WIDTH, TITLE_HEIGHT], fill=COLOR_TITLE_BG)
    kosu_baslik = f"{bulten_adi} - {kosu_verisi['Koşu']} ({kosu_verisi['Saat']}) - {agf_key.upper()} ANALİZİ"
    bbox = draw.textbbox((0, 0), kosu_baslik, font=font_title)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((WIDTH - w) / 2, (TITLE_HEIGHT - h) / 2), kosu_baslik, font=font_title, fill=(255, 255, 255))
    
    y = TITLE_HEIGHT
    draw.rectangle([0, y, WIDTH, y + HEADER_HEIGHT], fill=COLOR_HEADER_BG)
    draw.text((PADDING + 50, y + 12), "At Adı", font=font_bold, fill=COLOR_TEXT)
    draw.text((380, y + 12), "GANYAN (İlk→Son)", font=font_bold, fill=COLOR_TEXT)
    draw.text((580, y + 12), "AGF (İlk→Son)", font=font_bold, fill=COLOR_TEXT)
    draw.text((750, y + 12), "Değişim (Toplam)", font=font_bold, fill=COLOR_TEXT)
    draw.text((920, y + 12), "Son 30dk", font=font_bold, fill=COLOR_TEXT)
    draw.text((1060, y + 12), "Son 5dk", font=font_bold, fill=COLOR_TEXT)
    y += HEADER_HEIGHT

    for i, analiz in enumerate(at_analizleri):
        bg_color = (248, 255, 247) if i % 2 == 0 else (255, 255, 255)
        draw.rectangle([0, y, WIDTH, y + ROW_HEIGHT], fill=bg_color)
        
        trend_icon = "✓"; trend_color = COLOR_GREEN
        if analiz['mutlak_5dk'] < 0: trend_icon = "✗"; trend_color = COLOR_RED
        draw.text((PADDING, y + 11), f"{trend_icon}", font=font_bold, fill=trend_color)
        draw.text((PADDING + 25, y + 11), f"{analiz['at_no']}", font=font_bold, fill=COLOR_TEXT)
        draw.text((PADDING + 50, y + 11), f"{analiz['at_adi']}", font=font_regular, fill=COLOR_TEXT)
        
        ganyan_ilk = analiz.get('ilk_ganyan', 'N/A')
        ganyan_son = analiz.get('son_ganyan', 'N/A')
        ganyan_fark = analiz.get('ganyan_fark', 0)
        # --- YENİ: TERS RENKLENDİRME MANTIĞI ---
        ganyan_fark_renk = COLOR_GREEN if ganyan_fark > 0 else COLOR_RED # Pozitif (düşüş) yeşil, negatif (artış) kırmızı

        ganyan_text = f"{ganyan_ilk} → {ganyan_son}"
        ganyan_fark_text = f"({ganyan_fark:+.2f})"
        
        draw.text((380, y + 4), ganyan_text, font=font_regular, fill=COLOR_TEXT)
        draw.text((390, y + 20), ganyan_fark_text, font=font_regular, fill=ganyan_fark_renk)

        draw.text((580, y + 11), f"{analiz['ilk_agf']:.2f}% → {analiz['son_agf']:.2f}%", font=font_regular, fill=COLOR_TEXT)
        draw.text((760, y + 11), f"{analiz['mutlak_degisim']:+.2f}", font=font_regular, fill=(COLOR_GREEN if analiz['mutlak_degisim'] > 0 else COLOR_RED))
        draw.text((930, y + 11), f"{analiz['mutlak_30dk']:+.2f}", font=font_regular, fill=(COLOR_GREEN if analiz['mutlak_30dk'] > 0 else COLOR_RED))
        draw.text((1070, y + 11), f"{analiz['mutlak_5dk']:+.2f}", font=font_bold, fill=trend_color)

        y += ROW_HEIGHT
        draw.line([0, y, WIDTH, y], fill=COLOR_LINE)
        
    img.save(dosya_yolu); print(f"Rapor görseli oluşturuldu: {dosya_yolu}")

def create_agf_plot(kosu_verisi, bulten_adi, agf_key, dosya_yolu):
    # Bu fonksiyon değişmedi
    plt.style.use('default'); fig, ax = plt.subplots(figsize=(12, 7)); fig.patch.set_facecolor('white'); ax.set_facecolor('white')
    kosu_adi = kosu_verisi['Koşu']
    for at in kosu_verisi['At Bilgileri']:
        okumalar = [o for o in at.get('okumalar', []) if o.get(agf_key) is not None]
        if not okumalar: continue
        zamanlar = [datetime.strptime(o['zaman'], '%H:%M') for o in okumalar]
        agf_degerleri = [float(str(o[agf_key]).replace(',','.')) for o in okumalar]
        if zamanlar: ax.plot(zamanlar, agf_degerleri, marker='o', linestyle='-', label=f"#{at['At Numarası']} {at['At Adı']}")
    ax.set_title(f"{bulten_adi} {kosu_adi} - {agf_key.upper()} Değişim Grafiği", fontsize=16, color='black')
    ax.set_xlabel("Zaman", fontsize=12, color='black'); ax.set_ylabel("AGF Oranı (%)", fontsize=12, color='black')
    ax.tick_params(axis='x', colors='black'); ax.tick_params(axis='y', colors='black')
    ax.spines['left'].set_color('black'); ax.spines['top'].set_color('black'); ax.spines['bottom'].set_color('black'); ax.spines['right'].set_color('black')
    ax.legend(loc='best'); ax.grid(True, linestyle='--', alpha=0.6)
    ax.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M')); fig.autofmt_xdate()
    plt.tight_layout(); plt.savefig(dosya_yolu, facecolor='white'); plt.close()
    print(f"Grafik oluşturuldu: {dosya_yolu}")

def analyze_and_report(bulten_adi, altili_no):
    today_str = datetime.now().strftime('%d%m%Y'); base_path = "C:\\Users\\Ocal\\Desktop\\TJK\\"; folder_path = os.path.join(base_path, today_str)
    schedule_path = os.path.join(folder_path, "AltiliBaslama.json"); data_path = os.path.join(folder_path, f"{bulten_adi}.json")
    if not os.path.exists(schedule_path) or not os.path.exists(data_path): print(f"HATA: Gerekli JSON dosyaları bulunamadı."); return
    with open(schedule_path, 'r', encoding='utf-8') as f: schedule = json.load(f)
    with open(data_path, 'r', encoding='utf-8') as f: race_data = json.load(f)
    target_altili_str = f"{altili_no}. Altılı"
    altili_info = next((item for item in schedule if item["Bülten"] == bulten_adi and item["Altılı"] == target_altili_str), None)
    if not altili_info: print(f"HATA: {bulten_adi} için {target_altili_str} bilgisi bulunamadı."); return
    start_kosu_no = int(re.search(r'\d+', altili_info["Koşu"]).group())
    
    print(f"--- {bulten_adi} {target_altili_str} Raporu Oluşturuluyor ---")

    for i in range(6):
        kosu_no = start_kosu_no + i; kosu_adi_str = f"{kosu_no}.Koşu"
        kosu_verisi = next((p for p in race_data["programs"] if p["Koşu"].replace(" ", "") == kosu_adi_str), None)
        if not kosu_verisi or not kosu_verisi["At Bilgileri"]: print(f"UYARI: {kosu_adi_str} için veri bulunamadı."); continue
        
        agf_key = 'agf1' if altili_no == 1 else 'agf2'
        at_analizleri = []
        
        for at in kosu_verisi["At Bilgileri"]:
            okumalar = at.get('okumalar', [])
            agf_okumalari = [o for o in okumalar if o.get(agf_key) is not None]

            if len(agf_okumalari) < 2: continue
            
            # --- YENİ GANYAN MANTIĞI ---
            # Sayısal olan sabit ganyanları filtrele
            sabit_ganyan_okumalari = [o for o in okumalar if o.get('sabit_ganyan') and str(o['sabit_ganyan']).replace(',', '.').replace('.', '', 1).isdigit()]

            ilk_ganyan_str = 'N/A'
            son_ganyan_str = 'N/A'
            ganyan_fark = 0.0

            if sabit_ganyan_okumalari:
                # İlk ganyanı listenin başından al
                ilk_ganyan_str = sabit_ganyan_okumalari[0]['sabit_ganyan']
                # Son ganyanı listenin sonundan al
                son_ganyan_str = sabit_ganyan_okumalari[-1]['sabit_ganyan']

                try:
                    ilk_ganyan_float = float(str(ilk_ganyan_str).replace(',', '.'))
                    son_ganyan_float = float(str(son_ganyan_str).replace(',', '.'))
                    # TERS MANTIK: Oran düşerse fark pozitif olacak (ilk - son)
                    ganyan_fark = ilk_ganyan_float - son_ganyan_float
                except (ValueError, TypeError):
                    pass
            # --- BİTİŞ ---

            rapor_zamani = datetime.strptime(agf_okumalari[-1]['zaman'], '%H:%M')
            
            son_okuma = agf_okumalari[-1]; ilk_okuma = agf_okumalari[0]
            son_agf = float(str(son_okuma[agf_key]).replace(',','.')); ilk_agf = float(str(ilk_okuma[agf_key]).replace(',','.'))
            
            son_30dk_okumalar = [o for o in agf_okumalari if datetime.strptime(o['zaman'], '%H:%M') >= rapor_zamani - timedelta(minutes=30)]
            son_5dk_okumalar = [o for o in agf_okumalari if datetime.strptime(o['zaman'], '%H:%M') >= rapor_zamani - timedelta(minutes=5)]
            
            mutlak_degisim = son_agf - ilk_agf
            mutlak_30dk = son_agf - float(str(son_30dk_okumalar[0][agf_key]).replace(',','.')) if son_30dk_okumalar else 0
            mutlak_5dk = son_agf - float(str(son_5dk_okumalar[0][agf_key]).replace(',','.')) if son_5dk_okumalar else 0
            
            at_analizleri.append({
                'at_no': at['At Numarası'], 'at_adi': at['At Adı'],
                'ilk_ganyan': ilk_ganyan_str, 'son_ganyan': son_ganyan_str, 'ganyan_fark': ganyan_fark,
                'ilk_agf': ilk_agf, 'son_agf': son_agf,
                'mutlak_degisim': mutlak_degisim, 'mutlak_30dk': mutlak_30dk, 'mutlak_5dk': mutlak_5dk
            })

        if not at_analizleri: print(f"{kosu_verisi['Koşu']} için yeterli analiz verisi bulunamadı."); continue
            
        tablo_dosya_adi = f"RaporTablo_{bulten_adi}_{kosu_verisi['Koşu'].replace(' ', '')}.png"
        grafik_dosya_adi = f"RaporGrafik_{bulten_adi}_{kosu_verisi['Koşu'].replace(' ', '')}.png"
        tablo_yolu = os.path.join(folder_path, tablo_dosya_adi)
        grafik_yolu = os.path.join(folder_path, grafik_dosya_adi)
        
        create_report_image(kosu_verisi, bulten_adi, agf_key, at_analizleri, tablo_yolu)
        create_agf_plot(kosu_verisi, bulten_adi, agf_key, grafik_yolu)
        
        send_telegram_bundle(tablo_yolu)

if __name__ == '__main__':
    if len(sys.argv) != 3: print("Kullanım: python agf_analiz.py <BültenAdı> <AltılıNo>"); sys.exit(1)
    bulten = sys.argv[1].upper(); altili = int(sys.argv[2])
    analyze_and_report(bulten, altili)