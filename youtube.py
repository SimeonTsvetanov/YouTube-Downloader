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
            # no_titlebar=True,
            return_keyboard_events=True,
            grab_anywhere=True,
        )

    @staticmethod
    def layout():
        """
        The Layout create is using normal list MATRIX: [[], [], []].
        Just take a look at the code below it is pretty simple.
        """
        output = [
            [pg.Text("YouTube Downloader", text_color="red", font=("Helvetica", 12), key="label", pad=(4, 10))],
            [pg.ProgressBar(100, orientation='h', size=(38, 10), border_width=4, key='progress_bar')],
            [pg.Text("Select Playlist or Song:", pad=(4, 10))],
            [pg.Radio("Song", 'playlist_or_song', default=True, size=(10, 1)),
             pg.Radio("Playlist", 'playlist_or_song', size=(10, 1))],
            [pg.Text("Select the format you want to Download:", pad=(4, 10))],
            [pg.Radio("Audio", 'audio_or_video', default=True, size=(10, 1)),
             pg.Radio("Video", 'audio_or_video', size=(10, 1))],
            [pg.Text("Paste the YouTube link here:", pad=(4, 10))],
            [pg.InputText(do_not_clear=False, pad=(4, 10))],
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
        """
        bool :param song: True if we wish to download just a song, else False
        bool :param playlist: True if we wish to download the whole Playlist, else False
        bool :param audio: True if we wish to download in MP3 format, else False
        bool :param video: True if we wish to download in MP4 format, else False
        str(URL) :param link: the link from YouTube we wish to download
        :return: The program will Download the selected song/playlist in the selected format
        """
        if song:
            self.messgages('downloading', YouTube(link).title)  # Update the label

            # Start a thread to download the song:
            t = threading.Thread(target=self.download_media, args=(link, '', audio,), daemon=True)
            t.start()
            t.join()

        elif playlist:
            p = Playlist(link)  # Create the YouTube Playlist Object
            for i, s in enumerate(p):  # Now let's iterate through the playlist
                self.messgages('downloading', YouTube(s).title)  # Show the song that's being downloaded

                # Start a thread to download the song:
                t = threading.Thread(target=self.download_media, args=(s, p.title, audio,), daemon=True)
                t.start()
                t.join()

                self.window['progress_bar'].update(i + 1, len(p))  # Update the progress_bar

        self.popups('downloaded')
        self.messgages('downloaded')

    @staticmethod
    def download_media(video_to_download, output_path='', mp3=False):
        video_to_download = YouTube(video_to_download)  # Create the YouTube object from link
        # Get the best video quality and download it:
        video_name = video_to_download.streams.get_highest_resolution().download(output_path)
        path, file_name = os.path.split(video_name)

        if mp3:  # IF we want .mp3 only file:

            # First lets sort the naming dilema:
            name, ext = os.path.splitext(video_name)
            audio_name = name + '.mp3'

            # And then start a thread to convert the video to mp3:
            c = threading.Thread(target=App.convert_to_mp3, args=(video_name, audio_name,), daemon=True)
            c.start()
            c.join()

            # After it's done delete the old video file.
            os.remove(video_name)

    @staticmethod
    def convert_to_mp3(video_name, audio_name):
        # It's a magic threading trick
        clip = AudioFileClip(video_name)
        clip.write_audiofile(audio_name)
        clip.close()

    def messgages(self, m, song_name=None):
        if m == 'downloading':
            new_text = f"Downloading\n{song_name[:40]}"
            self.window.Element('label').update(new_text, text_color='white')
            self.window.refresh()
        elif m == 'downloaded':
            self.window.Element('label').update('YouTube Downloader', text_color='red')

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
