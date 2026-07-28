from .models import Project

def projects_processor(request):
    if request.user.is_authenticated:
        return {'projects': Project.objects.filter(user=request.user)}
    return {'projects': []}
