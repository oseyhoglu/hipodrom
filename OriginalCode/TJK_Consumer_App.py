import tkinter as tk
from tkinter import scrolledtext, messagebox, Frame
from datetime import datetime, timedelta
import time
import threading
import subprocess
import json
import os
import re

class TJKConsumerApp:
    def __init__(self, root):
        self.root = root
        self.root.title("TJK Veri Toplama Uygulaması (v2.6 - Anlık Ganyan Raporu)")
        self.root.geometry("850x550") # Geniş pencere boyutunu korudum
        self.is_running = False
        self.last_schedule_date = None
        self.current_tasks = []
        self.active_bulletins = {} 
        self.next_task_str = tk.StringVar(value="Sıradaki Görev: Başlatılmadı")
        
        # --- ARAYÜZ ---
        self.log_area = scrolledtext.ScrolledText(self.root, wrap=tk.WORD, state='disabled', bg='black', fg='white', font=("Consolas", 10))
        self.log_area.pack(padx=10, pady=10, expand=True, fill='both')
        
        control_frame = Frame(self.root)
        control_frame.pack(pady=5, fill='x', padx=10)

        self.start_button = tk.Button(control_frame, text="Başlat", command=self.start_consumer, width=12)
        self.start_button.pack(side='left', padx=5)
        self.stop_button = tk.Button(control_frame, text="Durdur", command=self.stop_consumer, state='disabled', width=12)
        self.stop_button.pack(side='left', padx=5)

        # --- YENİ GANYAN RAPORU BUTONU ---
        self.ganyan_report_button = tk.Button(control_frame, text="Ganyan Raporu (Anlık)", command=self.run_manual_ganyan_report, state='disabled', width=20)
        self.ganyan_report_button.pack(side='left', padx=15)
        # --- BİTİŞ ---
        
        self.report_frame = Frame(control_frame)
        self.report_frame.pack(side='right', padx=5)
        tk.Label(self.report_frame, text="Manuel Rapor:").pack(side='left')
        
        status_bar = tk.Label(self.root, textvariable=self.next_task_str, bd=1, relief=tk.SUNKEN, anchor=tk.W)
        status_bar.pack(side=tk.BOTTOM, fill=tk.X)
        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)

    def log(self, message):
        def _log():
            self.log_area.config(state='normal')
            self.log_area.insert(tk.END, f"{datetime.now().strftime('%H:%M:%S')} - {message}\n")
            self.log_area.see(tk.END)
            self.log_area.config(state='disabled')
        self.root.after(0, _log)

    def start_consumer(self):
        self.start_button.config(state='disabled'); self.stop_button.config(state='normal'); self.is_running = True
        threading.Thread(target=self.main_loop, daemon=True).start()
        self.log("Uygulama başlatıldı. Günlük görevler için saat 10:00 bekleniyor...")

    def stop_consumer(self):
        self.is_running = False
        self.start_button.config(state='normal')
        self.stop_button.config(state='disabled')
        self.ganyan_report_button.config(state='disabled') # Durdurunca butonu pasif yap
        self.log("Uygulama durduruluyor...")
        self.next_task_str.set("Sıradaki Görev: Durduruldu")

    def on_closing(self):
        if self.is_running and messagebox.askokcancel("Çıkış", "Uygulama çalışıyor. Çıkmak istediğinize emin misiniz?"):
            self.stop_consumer(); self.root.destroy()
        elif not self.is_running:
            self.root.destroy()
    
    def run_manual_report(self, bulten, altili_no):
        self.log(f"Manuel AGF Raporu tetiklendi: {bulten} {altili_no}. Altılı")
        threading.Thread(target=self._run_report_subprocess, args=(bulten, altili_no, 'AGF'), daemon=True).start()

    # --- YENİ MANUEL GANYAN RAPORU FONKSİYONU ---
    def run_manual_ganyan_report(self):
        self.log(f"Manuel Ganyan Raporu tetiklendi.")
        # GanyanRaporcu scripti kendi içinde günün tüm bültenlerini ve saatini kontrol ettiği için
        # sadece tetiklememiz yeterli. Argümana ihtiyaç duymuyor.
        threading.Thread(target=self._run_report_subprocess, args=(None, None, 'GANYAN'), daemon=True).start()

    def _run_report_subprocess(self, bulten, kosu_no, report_type):
        try:
            if report_type == 'AGF':
                script_path = r"C:\Users\Ocal\Desktop\TJK\Raporcu.bat"
                command = [script_path, bulten, str(kosu_no)]
                log_prefix = f"Manuel AGF Rapor ({bulten} {kosu_no})"
            elif report_type == 'GANYAN':
                script_path = r"C:\Users\Ocal\Desktop\TJK\GanyanRaporcu.bat"
                # Argüman olarak "MANUEL" ve "0" gönderiyoruz, script bunu işleyebilir.
                command = [script_path, "MANUEL", "0"]
                log_prefix = "Manuel Ganyan Raporu"
            else:
                return

            process = subprocess.run(command, capture_output=True, text=True, encoding='cp1254', errors='ignore')
            
            if process.returncode == 0:
                self.log(f"{log_prefix} başarıyla oluşturuldu.")
                for line in process.stdout.splitlines():
                    if line.strip(): self.log(f"-> {line}")
            else:
                self.log(f"{log_prefix} oluşturulurken hata oluştu: {process.stderr}")
        except Exception as e:
            self.log(f"{log_prefix} betiği çalıştırılamadı: {e}")

    def generate_schedule(self):
        self.log("Bugünün yarış takvimi oluşturuluyor...")
        try:
            python_exe = r"C:\Users\Ocal\AppData\Local\Programs\Python\Python313\python.exe"
            script_path = r"C:\Users\Ocal\Desktop\TJK\altilibaslangic.py"
            driver_klasoru = r"C:\Users\Ocal\Desktop\TJK"
            process = subprocess.Popen([python_exe, script_path], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='cp1254', errors='ignore', cwd=driver_klasoru)
            stdout, stderr = process.communicate()
            if process.returncode == 0:
                self.log("Yarış takvimi ve otomatik rapor görevleri başarıyla oluşturuldu."); self.log(stdout); return True
            else:
                self.log(f"Takvim oluşturulurken hata oluştu! HATA: {stderr}"); return False
        except Exception as e:
            self.log(f"Takvim oluşturma betiği çalıştırılamadı: {e}"); return False

    def load_tasks_from_schedule(self):
        self.log("Oluşturulan takvimden görevler yükleniyor..."); self.current_tasks = []
        for widget in self.report_frame.winfo_children():
            widget.destroy()
        tk.Label(self.report_frame, text="Manuel Rapor:").pack(side='left')
        self.active_bulletins.clear()
        try:
            folder_name = datetime.now().strftime('%d%m%Y')
            json_path = os.path.join(r"C:\Users\Ocal\Desktop\TJK", folder_name, "AltiliBaslama.json")
            with open(json_path, "r", encoding="utf-8") as f: schedule_data = json.load(f)

            today_date = datetime.now().date()
            tasks_by_time = {}

            for entry in schedule_data:
                bulten = entry["Bülten"]; altili_no_str = entry["Altılı"]
                altili_no = int(re.search(r'\d+', altili_no_str).group())

                if bulten not in self.active_bulletins: self.active_bulletins[bulten] = []
                if altili_no not in self.active_bulletins[bulten]: self.active_bulletins[bulten].append(altili_no)

                for key, value in entry.items():
                    if key.startswith("Kontrol_"):
                        task_key = (bulten, value)
                        if task_key not in tasks_by_time:
                            task_time_obj = datetime.strptime(value, "%H:%M").time()
                            task_datetime = datetime.combine(today_date, task_time_obj)
                            tasks_by_time[task_key] = {"bulten": bulten, "datetime": task_datetime, "kontrol_saati": value}
            
            self.current_tasks = list(tasks_by_time.values())
            self.current_tasks.sort(key=lambda x: x["datetime"])
            
            for bulten, altililar in self.active_bulletins.items():
                for altili_no in sorted(altililar):
                    btn = tk.Button(self.report_frame, text=f"{bulten}-{altili_no}", command=lambda b=bulten, a=altili_no: self.run_manual_report(b, a))
                    btn.pack(side='left', padx=2)
            
            self.ganyan_report_button.config(state='normal') # Manuel Ganyan Raporu butonunu aktif et
            self.log(f"{len(self.current_tasks)} adet görev başarıyla yüklendi."); return True
        except Exception as e:
            self.log(f"Görevler yüklenirken hata oluştu: {e}"); return False

    def run_task_execution(self, task):
        bulten = task.get("bulten")
        kontrol_saati = task.get("kontrol_saati")
        self.log(f"'{bulten}' için {kontrol_saati} verisi (AGF+Sabit Ganyan) çekme işlemi başlatıldı...")
        try:
            python_exe = r"C:\Users\Ocal\AppData\Local\Programs\Python\Python313\python.exe"
            script_path = r"C:\Users\Ocal\Desktop\TJK\TjkDataCek.py"
            driver_klasoru = r"C:\Users\Ocal\Desktop\TJK"
            command = [python_exe, script_path, bulten, kontrol_saati]
            
            process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='cp1254', errors='ignore', cwd=driver_klasoru)
            stdout, stderr = process.communicate()
            if process.returncode == 0:
                self.log(f"'{bulten}' için veri çekme işlemi tamamlandı.")
                for line in stdout.splitlines():
                    if line.strip(): self.log(f"-> {line}")
            else:
                if stderr: self.log(f"'{bulten}' için veri çekme işleminde HATA: {stderr}")
        except Exception as e:
            self.log(f"Veri çekme işlemi sırasında beklenmedik hata: {e}")

    def main_loop(self):
        while self.is_running:
            now = datetime.now(); today = now.date()
            if now.hour >= 10 and self.last_schedule_date != today:
                self.log(f"Saat 10:00. {today.strftime('%d-%m-%Y')} için takvim oluşturma işlemi başlıyor.")
                if self.generate_schedule():
                    self.last_schedule_date = today
                    if not self.load_tasks_from_schedule():
                        self.log("Takvim oluşturuldu ancak görevler yüklenemedi. Yarına kadar bekleniyor.")
                else:
                    self.log("Takvim oluşturulamadı. 1 saat sonra tekrar denenecek."); time.sleep(3600); continue
            if self.current_tasks:
                self.run_task_execution_loop()
            self.next_task_str.set(f"Sıradaki Görev: {today.strftime('%d-%m-%Y')} 10:00 bekleniyor...")
            time.sleep(30)
    
    def run_task_execution_loop(self):
        self.log("Günlük görev yürütme döngüsü başladı.")
        while self.is_running and self.current_tasks:
            now = datetime.now()
            self.current_tasks = [t for t in self.current_tasks if t["datetime"] > now - timedelta(minutes=2)]
            if not self.current_tasks: break
            
            next_task = self.current_tasks[0]
            task_time_str = next_task['datetime'].strftime('%H:%M:%S')
            bulten_name = next_task.get('bulten', 'Bilinmiyor')
            status_text = f"Sıradaki Görev: {bulten_name} - {task_time_str}"
            self.next_task_str.set(status_text)
            
            if now >= next_task["datetime"]:
                task_to_run = self.current_tasks.pop(0)
                threading.Thread(target=self.run_task_execution, args=(task_to_run,), daemon=True).start()
            time.sleep(5)
        self.log("Bugün için tüm görevler tamamlandı.")

if __name__ == "__main__":
    root = tk.Tk()
    app = TJKConsumerApp(root)
    root.mainloop()