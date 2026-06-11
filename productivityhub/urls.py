from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('dashboard.urls')),
    path('flashcards/', include('flashcards.urls')),
    path('analytics/', include('analytics.urls')),
]
