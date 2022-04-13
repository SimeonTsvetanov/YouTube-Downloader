# pyinstaller installation command: pyinstaller --onefile -w --icon=youtube.ico youtube.py

# Importing the libraries needed for the project
import PySimpleGUI as pg
from pytube import YouTube
from pytube import Playlist
import ctypes  # Used to make the app look better
import platform  # Used to make the app look better
import os
from pytube import exceptions


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
            # If you choose to use it with no title bar insted uncomment this two lines:
            # [pg.Text("YouTube Downloader", text_color="red", font=("Helvetica", 12), key="label", pad=(4, 10)),
            #  pg.Button(u'\u26cc', pad=((230, 0), 10))],
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
            except (KeyError, exceptions.RegexMatchError) as e:
                return False
        elif song:
            try:
                YouTube(url)
                return True
            except (KeyError, exceptions.RegexMatchError) as e:
                return False

    @staticmethod
    def convert_to_mp3(file):
        # Method will rename the extension from (.whatever) to .mp3
        # It's quite a dummy way. Yet it works just fine :D
        base, ext = os.path.splitext(file)
        new_file = base + '.mp3'
        os.rename(file, new_file)

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
            self.popups('downloading')
            if audio:
                App.download_audio(link)
            elif video:
                App.download_video(link)
            self.popups('downloaded')

        elif playlist:
            p = Playlist(link)  # Create the YouTube Playlist Object
            self.popups('downloading')
            for s in p:  # Now let's iterate through the playlist
                if audio:
                    App.download_audio(s, output_path=p.title)
                elif video:
                    App.download_video(s, output_path=p.title)
            self.popups('downloaded')

    @staticmethod
    def download_audio(song_to_download, output_path=''):
        song_to_download = YouTube(song_to_download)    # Create the YouTube object from link
        # Get the best audio quality and download it:
        song_to_convert = song_to_download.streams.get_audio_only().download(output_path)
        # Convert it to mp3:
        App.convert_to_mp3(song_to_convert)

    @staticmethod
    def download_video(video_to_download, output_path=''):
        video_to_download = YouTube(video_to_download)  # Create the YouTube object from link
        # Get the best video quality and download it:
        video_to_download.streams.get_highest_resolution().download(output_path)

    @staticmethod
    def popups(type_popup, *args):
        if type_popup == 'invalid link':
            pg.popup(
                'Invalid Link!',
                no_titlebar=True,
                any_key_closes=True,
                background_color='white',
                text_color='black')
        elif type_popup == "not public":
            pg.popup(
                'The Playlist must be PUBLIC',
                any_key_closes=True,
                no_titlebar=True,
                background_color='white',
                text_color='black')
        elif type_popup == "invalid message":
            pg.popup(
                f'{args[0]}',
                any_key_closes=True,
                no_titlebar=True,
                background_color='white',
                text_color='black')
        elif type_popup == "downloading":
            pg.popup_timed(
                f'Downloading... Please wait!',
                auto_close_duration=2,
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
