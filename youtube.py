# pyinstaller installation command: pyinstaller --onefile -w --icon=youtube_icon.ico youtube.py

# Importing the libraries needed for the project
import PySimpleGUI as pg  # The GUI liverary
from pytube import YouTube  # Liverary for dowloading YouTube media
from pytube import Playlist  # Work with Playlists
from pytube import exceptions  # Catch exceptions if the liberary is broken
import ctypes  # Used to make the app look better
import platform  # Used to make the app look better
import os  # Imported in order to work with files and paths in the system
from moviepy.audio.io.AudioFileClip import AudioFileClip  # Liverary to convert video files(.mp4) to audio(.mp3)
import threading  # Using Threading for downloading and converting files


class App:
    def __init__(self):
        self.name = "YouTube Downloader"
        self.theme = pg.theme("DarkBlue")
        self.window = pg.Window(
            self.name,
            self.layout(),
            return_keyboard_events=True,
            grab_anywhere=True,
        )
        self.conversion_threads = []  # Keeps all the conversion threads
        self.download_threads = []  # Keeps all the download threads

    @staticmethod
    def layout():
        """
        The Layout create is using normal list MATRIX: [[], [], []].
        Just take a look at the code below it is pretty simple.
        """
        output = [
            [pg.ProgressBar(100, orientation='h', size=(39, 1), border_width=4, key='progress_bar')],
            [pg.Text(f"{9*' '}YouTube Downloader\n", text_color="red", font=("Monaco", 12), key="label", pad=(4, 10))],
            [pg.Text("Select Playlist or Song:", pad=(4, 10))],
            [pg.Radio("Song", 'playlist_or_song', default=True, size=(10, 1)),
             pg.Radio("Playlist", 'playlist_or_song', size=(10, 1))],
            [pg.Text("Select the format you want to Download:", pad=(4, 10))],
            [pg.Radio("Audio", 'audio_or_video', default=True, size=(10, 1)),
             pg.Radio("Video", 'audio_or_video', size=(10, 1))],
            [pg.Text("Paste the YouTube link here:", pad=(4, 10))],
            [pg.InputText(do_not_clear=False, pad=(0, 10), size=(47, 2))],
            [pg.Button('Download', button_color="red", bind_return_key=True, size=(20, 2), pad=((145, 0), (20, 20)))]
        ]
        return output

    @staticmethod
    def make_dpi_aware():
        # This method will make the app look sharper (Make sure to run it before starting the program.)
        if int(platform.release()) >= 8:
            ctypes.windll.shcore.SetProcessDpiAwareness(True)

    @staticmethod
    def validate_url(url, song, playlist):
        if playlist:
            try:
                if Playlist(url).length > 0:
                    return True
            except (KeyError, exceptions.RegexMatchError):
                return False
        elif song:
            try:
                YouTube(url)
                return True
            except (KeyError, exceptions.RegexMatchError):
                return False

    def download(self, song, playlist, audio, video, link):
        # If song was selected: create a thread for downloading the song and add it to the thread pool.
        if song:
            # Thread will include additional arguments as we need them passed for other funcitons
            t = threading.Thread(target=self.download_media, args=(link, '', audio, 0, 1,), daemon=True)
            self.download_threads.append([t, YouTube(link).title, 0, 1])

        # If Playlist was selected: Create the Playlist object and iterate through it.
        elif playlist:
            p = Playlist(link)  # Create the YouTube Playlist Object
            for i, s in enumerate(p):  # Now let's iterate through the playlist
                # Create the Thread and append it to the thread pool.
                # Thread will include additional arguments as we need them passed for other funcitons
                t = threading.Thread(target=self.download_media, args=(s, p.title, audio, i, len(p),), daemon=True)
                self.download_threads.append([t, str(YouTube(s).title), int(i) + 1, len(p) + 1])

        # Now lets start Downloading:
        for thread_data in self.download_threads:
            thread = thread_data[0]  # Get the thread
            title = thread_data[1]  # Get the Song Title
            i = thread_data[2] + 1  # Get the starting index for the progress bar
            length = thread_data[3]  # Get the total length of the progress bar
            self.messgages('downloading', title[:42])  # Update the Label to show the song name we are downloading
            thread.start()  # Start the Thread
            thread.join()  # Join the Thread so that the app will wait for the download to complete
            self.window['progress_bar'].update(i, length)  # Update the progress_bar
            self.window.refresh()  # Refresh the window

        # If audio was selected lets start converting the files to .mp3
        if audio:
            for conv_thread_data in self.conversion_threads:
                thread = conv_thread_data[0]  # Get the thread
                name = conv_thread_data[1]  # Get the Song Title
                path = conv_thread_data[2]  # Get the path of the file
                index = conv_thread_data[3] + 1  # Get the starting index
                length = conv_thread_data[4]  # Get the total length of the progress bar
                self.messgages('converting', name[:42])  # Update the Label to show the song name we are converting
                thread.start()  # Start the Thread
                thread.join()  # Join the Thread so that the app will wait for the download to complete
                os.remove(path)  # Remove the video (.mp4) file
                self.window['progress_bar'].update(index, length)  # Update the progress_bar
                self.window.refresh()  # Refresh the Window

        self.download_threads.clear()  # Empty the download_threads
        self.conversion_threads.clear()  # Empty the conversion_threads

        self.window.Element('progress_bar').update(0, 100)
        self.popups('downloaded')  # Make a popup to show that we are DONE!
        self.messgages('downloaded')  # Change the Label back to ORIGINAL!

    def download_media(self, video_to_download, output_path='', mp3=False, index=0, length=1):
        video_to_download = YouTube(video_to_download)  # Create the YouTube object from link
        # Get the best video quality and download it:
        video_name = video_to_download.streams.get_highest_resolution().download(output_path)

        # Sort the naming Dilema:
        path, file_name = os.path.split(video_name)
        name, ext = os.path.splitext(video_name)
        audio_name = name + '.mp3'

        # And then start a thread to convert the video to mp3 (including additional data for other functions):
        c = threading.Thread(target=App.convert_to_mp3, args=(video_name, audio_name,), daemon=True)
        self.conversion_threads.append([c, file_name, video_name, index, length])

    @staticmethod
    def convert_to_mp3(video_name, audio_name):
        # It's a magic trick that needs threading...
        clip = AudioFileClip(video_name)
        clip.write_audiofile(audio_name)
        clip.close()

    def messgages(self, m, song_name=None):
        if m == 'downloading':
            new_text = f"Downloading Video:\n{song_name[:35]}"
            self.window.Element('label').update(new_text, text_color='gray')
            self.window.refresh()
        if m == 'converting':
            new_text = f"Converting to mp3:\n{song_name[:35]}"
            self.window.Element('label').update(new_text, text_color='gray')
            self.window.refresh()
        elif m == 'downloaded':
            self.window.Element('label').update(f"{9*' '}YouTube Downloader\n", text_color="red")

    @staticmethod
    def popups(type_popup, *args):
        if type_popup == 'invalid link':
            pg.popup(
                'Invalid Link!',
                no_titlebar=True,
                any_key_closes=True,
                background_color='white',
                text_color='black')
        elif type_popup == "invalid message":
            pg.popup(
                f'{args[0]}',
                any_key_closes=True,
                no_titlebar=True,
                background_color='white',
                text_color='black')
        elif type_popup == "downloaded":
            pg.popup(
                f'Done! All Downloaded!',
                any_key_closes=True,
                no_titlebar=True,
                background_color='white',
                text_color='black')

    def start(self):
        # Create an event loop to run the program:
        while True:
            # Fetch the input data
            event, data = self.window.read()

            # Check if the user would like to stop the program:
            if event in (pg.WIN_CLOSED, u'\u26cc', 'Escape:27'):
                self.window.close()
                break  # If so kill it!

            # Check if the button Download is clicked!
            elif event == "Download":
                # get all the data on the screen:
                s, p, a, v, li = data[0], data[1], data[2], data[3], data[4]

                # Check if the URL is valid and if so DOWNLOAD whatever is wanted!
                if self.validate_url(li, s, p):
                    self.download(song=s, playlist=p, audio=a, video=v, link=li)

                # If the link is invalid just update the LABEL
                else:
                    self.popups(type_popup='invalid link')


def run():
    app = App()  # Create the Application
    app.make_dpi_aware()  # Fix the resolution
    app.start()  # Start the Application


if __name__ == '__main__':
    run()
